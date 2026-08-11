import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/modules/auth/domain/auth.errors";
import { SlideError } from "@/modules/slides/domain/slide.errors";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), suggestOutline: vi.fn(), generate: vi.fn(), edit: vi.fn(), undo: vi.fn(), list: vi.fn(), detail: vi.fn(), delete: vi.fn(), bootstrapDesign: vi.fn(), saveDesign: vi.fn(), render: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ authService: { authenticate: mocks.authenticate } }));
vi.mock("@/modules/slides/infrastructure/slides", () => ({ slideService: mocks }));
import { PATCH as edit } from "./edit/route";
import { POST as generate } from "./generate/route";
import { POST as outline } from "./outline/route";
import { POST as undo } from "./[generationId]/undo/route";
import { GET as renderPresentation } from "./[generationId]/render/route";
import { GET as downloadPresentation } from "./[generationId]/download/route";
import { DELETE as deletePresentation, GET as detail } from "./[generationId]/route";
import { GET as list } from "./route";
import { POST as bootstrapDesign } from "./design/bootstrap/route";
import { PATCH as saveDesign } from "./design/save/route";

const id = "123e4567-e89b-12d3-a456-426614174000";
const user = { id: "user-1", email: "u@test.com", status: "ACTIVE", lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
const presentation = { id, userId: "user-1", status: "COMPLETED", approvedOutline: { title: "Deck", slides: [{ number: 1, title: "One", summary: "S" }] }, htmlContent: null, currentRevisionNumber: 1, nextRevisionNumber: 2, provider: "openai", modelId: "model", finishReason: null, promptTokens: 1, completionTokens: 2, totalTokens: 3, title: "Deck", createdAt: new Date("2026-08-02T00:00:00Z"), updatedAt: new Date("2026-08-02T00:01:00Z"), completedAt: new Date("2026-08-02T00:01:00Z") };
const structuredRevision = {
  animationRegistryVersion: 1,
  slides: [{
    number: 1,
    width: 960,
    height: 540,
    props: {},
    elements: [{ id: "el-0", type: "text", schemaVersion: 1, geometry: { x: 0, y: 0, width: 400, height: 80, zIndex: 0 }, props: { text: "Hello", styleType: "body", fontSize: 18, fontWeight: 400, color: "#171713", backgroundColor: null, align: "left", bold: false, italic: false, underline: false, list: "none" }, animation: null, children: [] }],
  }],
};
const presentationDetail = { generation: presentation, structuredRevision, undoableSlideNumbers: [1] };

describe("slide routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(user); mocks.suggestOutline.mockResolvedValue(presentation.approvedOutline); mocks.generate.mockResolvedValue(presentationDetail); mocks.edit.mockResolvedValue(presentationDetail); mocks.undo.mockResolvedValue(presentationDetail); mocks.list.mockResolvedValue({ items: [presentation], nextCursor: null }); mocks.detail.mockResolvedValue(presentationDetail); mocks.delete.mockResolvedValue(undefined); mocks.bootstrapDesign.mockResolvedValue(presentationDetail); mocks.saveDesign.mockResolvedValue(presentationDetail); mocks.render.mockResolvedValue(structuredRevision); });
  it("authenticates before parsing outline uploads", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    const response = await outline(new Request("http://localhost/api/slides/outline", { method: "POST", body: "bad" }));
    expect(response.status).toBe(401); expect(mocks.suggestOutline).not.toHaveBeenCalled();
  });
  it("returns actionable outline validation errors", async () => {
    const form = creationForm();
    form.delete("dataFiles");
    const response = await outline(new Request("http://localhost/api/slides/outline", { method: "POST", body: form }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { message: "Missing dataFiles files" } });
  });
  it("passes metadata, repeated files, and cancellation signal to outline service", async () => {
    const form = creationForm(); form.append("dataFiles", new File(["y"], "other.txt", { type: "text/plain" }));
    const request = new Request("http://localhost/api/slides/outline", { method: "POST", body: form });
    expect((await outline(request)).status).toBe(200); expect(mocks.suggestOutline).toHaveBeenCalledWith(expect.objectContaining({ title: "Deck", slideCount: 1, dataFiles: expect.arrayContaining([expect.any(File), expect.any(File)]) }), request.signal);
    expect(mocks.suggestOutline.mock.calls[0][0]).not.toHaveProperty("templateFiles");
  });
  it("creates a presentation from multipart input", async () => {
    const form = creationForm(); form.set("outline", JSON.stringify(presentation.approvedOutline));
    const response = await generate(new Request("http://localhost/api/slides/generate", { method: "POST", body: form }));
    expect(response.status).toBe(201); expect(mocks.generate).toHaveBeenCalledWith("user-1", expect.objectContaining({ title: "Deck", outline: presentation.approvedOutline, dataFiles: [expect.any(File)], templateFiles: [expect.any(File)] }), expect.any(AbortSignal));
  });
  it("validates and sends one batch edit route", async () => {
    const request = new Request("http://localhost/api/slides/edit", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: id, edits: [{ slideNumber: 1, prompt: "Improve" }] }) });
    expect((await edit(request)).status).toBe(200); expect(mocks.edit).toHaveBeenCalledWith("user-1", expect.objectContaining({ generationId: id }), request.signal);
  });
  it("maps ownership and provider errors", async () => {
    mocks.edit.mockRejectedValueOnce(new SlideError("NOT_FOUND", "Presentation not found"));
    const request = new Request("http://localhost/api/slides/edit", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: id, edits: [{ slideNumber: 1, prompt: "Improve" }] }) });
    expect((await edit(request)).status).toBe(404);
    mocks.undo.mockRejectedValueOnce(new SlideError("PROVIDER_ERROR", "AI provider request failed"));
    expect((await undo(new Request(`http://localhost/api/slides/${id}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slideNumber: 1 }) }), { params: Promise.resolve({ generationId: id }) })).status).toBe(502);
  });
  it("rejects malformed per-slide undo input", async () => {
    const response = await undo(new Request(`http://localhost/api/slides/${id}/undo`, { method: "POST", headers: { "content-type": "application/json" }, body: "bad" }), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(400);
    expect(mocks.undo).not.toHaveBeenCalled();
  });

  it("authenticates before validating list queries", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    const response = await list(new Request("http://localhost/api/slides?limit=999"));
    expect(response.status).toBe(401);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists safe presentation summaries with pagination", async () => {
    const response = await list(new Request("http://localhost/api/slides?limit=10"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.list).toHaveBeenCalledWith("user-1", { limit: 10 });
    expect(body.items[0]).toEqual({
      id,
      title: "Deck",
      status: "COMPLETED",
      currentRevisionNumber: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:01:00.000Z",
      completedAt: "2026-08-02T00:01:00.000Z",
    });
    expect(JSON.stringify(body)).not.toMatch(/htmlContent|approvedOutline|userId|provider|modelId/);
  });

  it("rejects invalid pagination", async () => {
    const response = await list(new Request("http://localhost/api/slides?limit=51"));
    expect(response.status).toBe(400);
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("returns an owned detail without persistence-only fields", async () => {
    const response = await detail(new Request(`http://localhost/api/slides/${id}`), { params: Promise.resolve({ generationId: id }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(mocks.detail).toHaveBeenCalledWith("user-1", id);
    expect(body).toMatchObject({ id, title: "Deck" });
    expect(body.document).toMatchObject({ animationRegistryVersion: 1 });
    expect(body.undoableSlideNumbers).toEqual([1]);
    expect(JSON.stringify(body)).not.toMatch(/userId|nextRevisionNumber|requestPayload|htmlContent/);
  });

  it("deletes an owned presentation with no response body", async () => {
    const response = await deletePresentation(new Request(`http://localhost/api/slides/${id}`, { method: "DELETE" }), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(mocks.delete).toHaveBeenCalledWith("user-1", id);
  });

  it("maps concealed ownership and delete conflicts", async () => {
    mocks.detail.mockRejectedValueOnce(new SlideError("NOT_FOUND", "Presentation not found"));
    expect((await detail(new Request(`http://localhost/api/slides/${id}`), { params: Promise.resolve({ generationId: id }) })).status).toBe(404);
    mocks.delete.mockRejectedValueOnce(new SlideError("CONFLICT", "Presentation is processing"));
    expect((await deletePresentation(new Request(`http://localhost/api/slides/${id}`, { method: "DELETE" }), { params: Promise.resolve({ generationId: id }) })).status).toBe(409);
  });

  it("authenticates before bootstrapping a design project", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    const response = await bootstrapDesign(new Request("http://localhost/api/slides/design/bootstrap", { method: "POST", body: "bad" }));
    expect(response.status).toBe(401);
    expect(mocks.bootstrapDesign).not.toHaveBeenCalled();
  });

  it("bootstraps a blank design project and returns 201", async () => {
    const request = new Request("http://localhost/api/slides/design/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Board deck", mode: "blank", slideCount: 3 }) });
    const response = await bootstrapDesign(request);
    expect(response.status).toBe(201);
    expect(mocks.bootstrapDesign).toHaveBeenCalledWith("user-1", { title: "Board deck", mode: "blank", slideCount: 3 });
    const body = await response.json();
    expect(body).toMatchObject({ id, title: "Deck" });
  });

  it("rejects a template bootstrap request missing templateId", async () => {
    const request = new Request("http://localhost/api/slides/design/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "From template", mode: "template" }) });
    const response = await bootstrapDesign(request);
    expect(response.status).toBe(400);
    expect(mocks.bootstrapDesign).not.toHaveBeenCalled();
  });

  it("saves a design with its expected revision", async () => {
    const slides = [{ number: 1, width: 960, height: 540, elements: [] }];
    const request = new Request("http://localhost/api/slides/design/save", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: id, slides, expectedRevision: 1 }) });
    const response = await saveDesign(request);
    expect(response.status).toBe(200);
    expect(mocks.saveDesign).toHaveBeenCalledWith("user-1", { generationId: id, slides, expectedRevision: 1 });
  });

  it("maps a stale design-save revision to a 409 conflict", async () => {
    mocks.saveDesign.mockRejectedValueOnce(new SlideError("CONFLICT", "Presentation changed concurrently"));
    const slides = [{ number: 1, width: 960, height: 540, elements: [] }];
    const request = new Request("http://localhost/api/slides/design/save", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ generationId: id, slides, expectedRevision: 1 }) });
    expect((await saveDesign(request)).status).toBe(409);
  });

  it("renders a completed presentation as safe inline HTML", async () => {
    const response = await renderPresentation(new Request(`http://localhost/api/slides/${id}/render`), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toBeNull();
    const body = await response.text();
    expect(body).toContain("<!doctype html>");
    expect(body).toContain("Hello");
    expect(mocks.render).toHaveBeenCalledWith("user-1", id);
  });

  it("downloads a completed presentation as a standalone attachment", async () => {
    const response = await downloadPresentation(new Request(`http://localhost/api/slides/${id}/download`), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(response.headers.get("content-disposition")).toContain(id);
  });

  it("requires authentication before rendering or downloading", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    expect((await renderPresentation(new Request(`http://localhost/api/slides/${id}/render`), { params: Promise.resolve({ generationId: id }) })).status).toBe(401);
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("conceals a missing or non-owned presentation behind the same 404 on render", async () => {
    mocks.render.mockRejectedValueOnce(new SlideError("NOT_FOUND", "Presentation not found"));
    const response = await renderPresentation(new Request(`http://localhost/api/slides/${id}/render`), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(404);
  });

  it("maps an incomplete presentation to a 409 conflict on render", async () => {
    mocks.render.mockRejectedValueOnce(new SlideError("CONFLICT", "Presentation is not ready to render"));
    const response = await renderPresentation(new Request(`http://localhost/api/slides/${id}/render`), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(409);
  });

  it("maps a renderer failure (e.g. a malformed stored graph) to a safe 500 without leaking internals", async () => {
    mocks.render.mockResolvedValueOnce({
      animationRegistryVersion: 1,
      slides: [{ number: 1, width: 960, height: 540, props: {}, elements: [{ id: "el-0", type: "unregistered-type", schemaVersion: 1, geometry: { x: 0, y: 0, width: 10, height: 10, zIndex: 0 }, props: {}, animation: null, children: [] }] }],
    });
    const response = await downloadPresentation(new Request(`http://localhost/api/slides/${id}/download`), { params: Promise.resolve({ generationId: id }) });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.message).toBe("Unable to render structured revision");
  });
});

function creationForm() {
  const form = new FormData();
  form.set("title", "Deck"); form.set("prompt", "Explain results"); form.set("slideCount", "1");
  form.append("dataFiles", new File(["x"], "report.txt", { type: "text/plain" }));
  form.append("templateFiles", new File(["x"], "template.html", { type: "text/html" }));
  return form;
}
