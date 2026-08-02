import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIGenerator, SlideRepository, StoredPresentation } from "./slide.ports";
import { SlideService } from "./slide.service";

const outline = { title: "Deck", slides: [{ number: 1, title: "One", summary: "First" }, { number: 2, title: "Two", summary: "Second" }] };
const html = '<!doctype html><html><head><style>.slai-slide{color:#123456}</style></head><body><div class="slai-slide" data-slide-number="1">One</div><div class="slai-slide" data-slide-number="2">Two</div></body></html>';
const stored: StoredPresentation = { id: "123e4567-e89b-12d3-a456-426614174000", userId: "user-1", status: "COMPLETED", approvedOutline: outline, htmlContent: html, currentRevisionNumber: 1, nextRevisionNumber: 2, provider: "openai", modelId: "model", finishReason: "stop", promptTokens: 1, completionTokens: 2, totalTokens: 3, title: "Deck", createdAt: new Date("2026-08-02T00:00:00Z"), updatedAt: new Date("2026-08-02T00:01:00Z"), completedAt: new Date("2026-08-02T00:01:00Z") };
const creation = { title: "Deck", prompt: "Explain results", slideCount: 2, dataFiles: [new File(["x"], "r.txt", { type: "text/plain" })], templateFiles: [new File(["x"], "t.html", { type: "text/html" })] };

function repository(): SlideRepository { return { createGeneration: vi.fn().mockResolvedValue({ ...stored, status: "PROCESSING" }), failGeneration: vi.fn(), completeGeneration: vi.fn().mockResolvedValue(stored), findOwned: vi.fn().mockResolvedValue(stored), listOwned: vi.fn().mockResolvedValue([]), deleteOwned: vi.fn().mockResolvedValue(true), appendEdit: vi.fn().mockImplementation(async ({ html: next }) => ({ ...stored, htmlContent: next, currentRevisionNumber: 2 })), undo: vi.fn().mockResolvedValue({ ...stored, currentRevisionNumber: 2, nextRevisionNumber: 3 }), undoableSlideNumbers: vi.fn().mockResolvedValue([1]) }; }
function ai(): AIGenerator { return { generate: vi.fn() }; }

describe("SlideService", () => {
  let repo: SlideRepository; let generator: AIGenerator; let service: SlideService;
  beforeEach(() => { repo = repository(); generator = ai(); service = new SlideService(repo, generator, "openai", "model"); });
  it("suggests and validates an outline in JSON mode", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: JSON.stringify(outline), model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
    await expect(service.suggestOutline(creation)).resolves.toEqual(outline);
    const request = vi.mocked(generator.generate).mock.calls[0][0];
    expect(request).toMatchObject({ responseFormat: "json_object" });
    const content = request.messages[1].content;
    expect(content).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "r.txt" })]));
    expect(content).not.toEqual(expect.arrayContaining([expect.objectContaining({ filename: "t.html" })]));
  });
  it("marks generation failed when model HTML is invalid", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: "bad", model: "model", finishReason: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    await expect(service.generate("user-1", { ...creation, outline })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.failGeneration).toHaveBeenCalled();
    expect(repo.completeGeneration).not.toHaveBeenCalled();
  });
  it("completes a valid generation with revision-ready HTML", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: html, model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
    await expect(service.generate("user-1", { ...creation, outline })).resolves.toEqual(stored);
    expect(repo.completeGeneration).toHaveBeenCalledWith(stored.id, expect.stringContaining("slai-slide"), expect.objectContaining({ model: "model" }));
    const content = vi.mocked(generator.generate).mock.calls[0][0].messages[1].content;
    expect(content).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining("AUTHORITATIVE DATA FILES") }),
      expect.objectContaining({ filename: "r.txt" }),
      expect.objectContaining({ text: expect.stringContaining("VISUAL TEMPLATE FILES") }),
      expect.objectContaining({ filename: "t.html" }),
    ]));
  });
  it("applies multiple replacements in one repository edit", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: JSON.stringify({ slides: [{ slideNumber: 1, html: '<div class="slai-slide" data-slide-number="1">A</div>' }, { slideNumber: 2, html: '<div class="slai-slide" data-slide-number="2">B</div>' }] }), model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
    await service.edit("user-1", { generationId: stored.id, edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 2, prompt: "B" }] });
    expect(repo.appendEdit).toHaveBeenCalledOnce();
    expect(vi.mocked(repo.appendEdit).mock.calls[0][0].html).toContain(">A</div>");
  });
  it("rejects incomplete replacement sets without persisting", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: JSON.stringify({ slides: [{ slideNumber: 1, html: '<div class="slai-slide" data-slide-number="1">A</div>' }] }), model: "model", finishReason: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    await expect(service.edit("user-1", { generationId: stored.id, edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 2, prompt: "B" }] })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.appendEdit).not.toHaveBeenCalled();
  });
  it("supports undo and reports conflicts", async () => {
    await expect(service.undo("user-1", stored.id, 1)).resolves.toMatchObject({ generation: { currentRevisionNumber: 2 }, undoableSlideNumbers: [1] });
    vi.mocked(repo.undo).mockResolvedValueOnce(null);
    await expect(service.undo("user-1", stored.id, 1)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("conceals presentations not owned by the user", async () => {
    vi.mocked(repo.findOwned).mockResolvedValueOnce(null);
    await expect(service.undo("other-user", stored.id, 1)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns bounded list pages and an opaque next cursor", async () => {
    const rows = [
      { id: "123e4567-e89b-12d3-a456-426614174000", title: "A", status: "COMPLETED" as const, currentRevisionNumber: 1, createdAt: new Date("2026-08-02T02:00:00Z"), updatedAt: new Date(), completedAt: new Date() },
      { id: "123e4567-e89b-12d3-a456-426614174001", title: "B", status: "FAILED" as const, currentRevisionNumber: null, createdAt: new Date("2026-08-02T01:00:00Z"), updatedAt: new Date(), completedAt: new Date() },
    ];
    vi.mocked(repo.listOwned).mockResolvedValueOnce(rows);
    const page = await service.list("user-1", { limit: 1 });
    expect(page.items).toEqual([rows[0]]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(repo.listOwned).toHaveBeenCalledWith({ userId: "user-1", limit: 1 });
  });

  it("returns owner detail for incomplete lifecycle states", async () => {
    const failed = { ...stored, status: "FAILED" as const, htmlContent: null };
    vi.mocked(repo.findOwned).mockResolvedValueOnce(failed);
    await expect(service.detail("user-1", stored.id)).resolves.toEqual({ generation: failed, undoableSlideNumbers: [] });
  });

  it("deletes through the policy and reports stale deletes", async () => {
    await expect(service.delete("user-1", stored.id)).resolves.toBeUndefined();
    expect(repo.deleteOwned).toHaveBeenCalledWith({ id: stored.id, userId: "user-1" });
    vi.mocked(repo.deleteOwned).mockResolvedValueOnce(false);
    await expect(service.delete("user-1", stored.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
