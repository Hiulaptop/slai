import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "@/modules/auth/domain/auth.errors";
import { SlideError } from "@/modules/slides/domain/slide.errors";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn(), suggestOutline: vi.fn(), generate: vi.fn(), edit: vi.fn(), undo: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({ authService: { authenticate: mocks.authenticate } }));
vi.mock("@/modules/slides/infrastructure/slides", () => ({ slideService: mocks }));
import { PATCH as edit } from "./edit/route";
import { POST as generate } from "./generate/route";
import { POST as outline } from "./outline/route";
import { POST as undo } from "./[generationId]/undo/route";

const id = "123e4567-e89b-12d3-a456-426614174000";
const user = { id: "user-1", email: "u@test.com", status: "ACTIVE", lastLoginAt: null, createdAt: new Date(), updatedAt: new Date() };
const presentation = { id, status: "COMPLETED", approvedOutline: { title: "Deck", slides: [{ number: 1, title: "One", summary: "S" }] }, htmlContent: "<html></html>", currentRevisionNumber: 1, provider: "openai", modelId: "model", finishReason: null, promptTokens: 1, completionTokens: 2, totalTokens: 3 };

describe("slide routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authenticate.mockResolvedValue(user); mocks.suggestOutline.mockResolvedValue(presentation.approvedOutline); mocks.generate.mockResolvedValue(presentation); mocks.edit.mockResolvedValue(presentation); mocks.undo.mockResolvedValue(presentation); });
  it("authenticates before parsing outline uploads", async () => {
    mocks.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    const response = await outline(new Request("http://localhost/api/slides/outline", { method: "POST", body: "bad" }));
    expect(response.status).toBe(401); expect(mocks.suggestOutline).not.toHaveBeenCalled();
  });
  it("passes report and cancellation signal to outline service", async () => {
    const form = new FormData(); form.set("report", new File(["x"], "report.txt", { type: "text/plain" }));
    const request = new Request("http://localhost/api/slides/outline", { method: "POST", body: form });
    expect((await outline(request)).status).toBe(200); expect(mocks.suggestOutline).toHaveBeenCalledWith(expect.any(File), request.signal);
  });
  it("creates a presentation from multipart input", async () => {
    const form = new FormData(); form.set("report", new File(["x"], "r.txt", { type: "text/plain" })); form.set("template", new File(["x"], "t.html", { type: "text/html" })); form.set("outline", JSON.stringify(presentation.approvedOutline));
    const response = await generate(new Request("http://localhost/api/slides/generate", { method: "POST", body: form }));
    expect(response.status).toBe(201); expect(mocks.generate).toHaveBeenCalledWith("user-1", expect.any(File), expect.any(File), presentation.approvedOutline, expect.any(AbortSignal));
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
    expect((await undo(new Request(`http://localhost/api/slides/${id}/undo`, { method: "POST" }), { params: Promise.resolve({ generationId: id }) })).status).toBe(502);
  });
});
