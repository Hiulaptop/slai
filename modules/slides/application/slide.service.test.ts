import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIGenerator, SlideRepository, StoredPresentation } from "./slide.ports";
import { SlideService } from "./slide.service";

const outline = { title: "Deck", slides: [{ number: 1, title: "One", summary: "First" }, { number: 2, title: "Two", summary: "Second" }] };
const html = '<!doctype html><html><head></head><body><div class="slai-slide" data-slide-number="1">One</div><div class="slai-slide" data-slide-number="2">Two</div></body></html>';
const stored: StoredPresentation = { id: "123e4567-e89b-12d3-a456-426614174000", userId: "user-1", status: "COMPLETED", approvedOutline: outline, htmlContent: html, currentRevisionNumber: 1, nextRevisionNumber: 2, provider: "openai", modelId: "model", finishReason: "stop", promptTokens: 1, completionTokens: 2, totalTokens: 3 };

function repository(): SlideRepository { return { createGeneration: vi.fn().mockResolvedValue({ ...stored, status: "PROCESSING" }), failGeneration: vi.fn(), completeGeneration: vi.fn().mockResolvedValue(stored), findOwned: vi.fn().mockResolvedValue(stored), appendEdit: vi.fn().mockImplementation(async ({ html: next }) => ({ ...stored, htmlContent: next, currentRevisionNumber: 2 })), undo: vi.fn().mockResolvedValue({ ...stored, currentRevisionNumber: 1 }) }; }
function ai(): AIGenerator { return { generate: vi.fn() }; }

describe("SlideService", () => {
  let repo: SlideRepository; let generator: AIGenerator; let service: SlideService;
  beforeEach(() => { repo = repository(); generator = ai(); service = new SlideService(repo, generator, "openai", "model"); });
  it("suggests and validates an outline in JSON mode", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: JSON.stringify(outline), model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
    await expect(service.suggestOutline(new File(["x"], "r.txt", { type: "text/plain" }))).resolves.toEqual(outline);
    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({ responseFormat: "json_object" }), expect.anything());
  });
  it("marks generation failed when model HTML is invalid", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: "bad", model: "model", finishReason: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    await expect(service.generate("user-1", new File(["x"], "r.txt", { type: "text/plain" }), new File(["x"], "t.html", { type: "text/html" }), outline)).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.failGeneration).toHaveBeenCalled();
    expect(repo.completeGeneration).not.toHaveBeenCalled();
  });
  it("completes a valid generation with revision-ready HTML", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: html, model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } });
    await expect(service.generate("user-1", new File(["x"], "r.txt", { type: "text/plain" }), new File(["x"], "t.html", { type: "text/html" }), outline)).resolves.toEqual(stored);
    expect(repo.completeGeneration).toHaveBeenCalledWith(stored.id, expect.stringContaining("slai-slide"), expect.objectContaining({ model: "model" }));
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
    await expect(service.undo("user-1", stored.id)).resolves.toMatchObject({ currentRevisionNumber: 1 });
    vi.mocked(repo.undo).mockResolvedValueOnce(null);
    await expect(service.undo("user-1", stored.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("conceals presentations not owned by the user", async () => {
    vi.mocked(repo.findOwned).mockResolvedValueOnce(null);
    await expect(service.undo("other-user", stored.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
