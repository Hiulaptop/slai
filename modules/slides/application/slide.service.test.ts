import { beforeEach, describe, expect, it, vi } from "vitest";
import { CURRENT_ANIMATION_REGISTRY_VERSION } from "../domain/structured/animation-registry";
import type { StructuredRevision } from "../domain/structured/types";
import type { AIGenerator, SlideRepository, StoredPresentation } from "./slide.ports";
import { SlideService } from "./slide.service";

const outline = { title: "Deck", slides: [{ number: 1, title: "One", summary: "First" }, { number: 2, title: "Two", summary: "Second" }] };
const stored: StoredPresentation = { id: "123e4567-e89b-12d3-a456-426614174000", userId: "user-1", status: "COMPLETED", approvedOutline: outline, htmlContent: null, currentRevisionNumber: 1, nextRevisionNumber: 2, provider: "openai", modelId: "model", finishReason: "stop", promptTokens: 1, completionTokens: 2, totalTokens: 3, title: "Deck", createdAt: new Date("2026-08-02T00:00:00Z"), updatedAt: new Date("2026-08-02T00:01:00Z"), completedAt: new Date("2026-08-02T00:01:00Z") };
const creation = { title: "Deck", prompt: "Explain results", slideCount: 2, dataFiles: [new File(["x"], "r.txt", { type: "text/plain" })], templateFiles: [new File(["x"], "t.html", { type: "text/html" })] };

const structuredRevision: StructuredRevision = {
  animationRegistryVersion: CURRENT_ANIMATION_REGISTRY_VERSION,
  slides: [
    { number: 1, width: 960, height: 540, props: {}, elements: [] },
    { number: 2, width: 960, height: 540, props: {}, elements: [] },
  ],
};

function textElement(text: string, overrides: Partial<{ x: number; y: number; width: number; height: number; zIndex: number }> = {}) {
  return {
    type: "text",
    geometry: { x: overrides.x ?? 0, y: overrides.y ?? 0, width: overrides.width ?? 400, height: overrides.height ?? 80, zIndex: overrides.zIndex ?? 0 },
    props: { text, styleType: "body", fontSize: 18, fontWeight: 400, color: "#171713", backgroundColor: null, align: "left", bold: false, italic: false, underline: false, list: "none" },
    animation: null,
  };
}
function wireSlide(number: number, elements = [textElement(`Slide ${number}`)]) {
  return { number, width: 960, height: 540, elements };
}

function repository(): SlideRepository {
  return {
    createGeneration: vi.fn().mockResolvedValue({ ...stored, status: "PROCESSING" }),
    failGeneration: vi.fn(),
    completeGeneration: vi.fn(),
    findOwned: vi.fn().mockResolvedValue(stored),
    listOwned: vi.fn().mockResolvedValue([]),
    deleteOwned: vi.fn().mockResolvedValue(true),
    appendEdit: vi.fn(),
    saveDesign: vi.fn(),
    undo: vi.fn(),
    undoableSlideNumbers: vi.fn().mockResolvedValue([]),
    loadCurrentStructuredRevision: vi.fn().mockResolvedValue(structuredRevision),
    completeStructuredGeneration: vi.fn().mockResolvedValue(stored),
    saveStructuredDesign: vi.fn().mockResolvedValue({ ...stored, currentRevisionNumber: 2 }),
    appendStructuredEdit: vi.fn().mockResolvedValue({ ...stored, currentRevisionNumber: 2 }),
    undoStructured: vi.fn().mockResolvedValue({ ...stored, currentRevisionNumber: 2, nextRevisionNumber: 3 }),
    undoableStructuredSlideNumbers: vi.fn().mockResolvedValue([1]),
  };
}
function ai(): AIGenerator { return { generate: vi.fn() }; }
function aiResponse(text: string) { return { text, model: "model", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } }; }

describe("SlideService", () => {
  let repo: SlideRepository; let generator: AIGenerator; let service: SlideService;
  beforeEach(() => { repo = repository(); generator = ai(); service = new SlideService(repo, generator, "openai", "model"); });

  it("suggests and validates an outline in JSON mode", async () => {
    vi.mocked(generator.generate).mockResolvedValue(aiResponse(JSON.stringify(outline)));
    await expect(service.suggestOutline(creation)).resolves.toEqual(outline);
    const request = vi.mocked(generator.generate).mock.calls[0][0];
    expect(request).toMatchObject({ responseFormat: "json_object" });
    const content = request.messages[1].content;
    expect(content).toEqual(expect.arrayContaining([expect.objectContaining({ filename: "r.txt" })]));
    expect(content).not.toEqual(expect.arrayContaining([expect.objectContaining({ filename: "t.html" })]));
  });

  it("marks generation failed when the model returns invalid JSON", async () => {
    vi.mocked(generator.generate).mockResolvedValue({ text: "bad", model: "model", finishReason: null, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });
    await expect(service.generate("user-1", { ...creation, outline })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.failGeneration).toHaveBeenCalled();
    expect(repo.completeStructuredGeneration).not.toHaveBeenCalled();
  });

  it("rejects generation when the model returns the wrong slide count", async () => {
    vi.mocked(generator.generate).mockResolvedValue(aiResponse(JSON.stringify({ slides: [wireSlide(1)] })));
    await expect(service.generate("user-1", { ...creation, outline })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.completeStructuredGeneration).not.toHaveBeenCalled();
  });

  it("completes a valid generation with a structured document", async () => {
    vi.mocked(generator.generate).mockResolvedValue(aiResponse(JSON.stringify({ slides: [wireSlide(1), wireSlide(2)] })));
    await expect(service.generate("user-1", { ...creation, outline })).resolves.toEqual({ generation: stored, structuredRevision, undoableSlideNumbers: [1] });
    expect(repo.completeStructuredGeneration).toHaveBeenCalledWith(
      stored.id,
      expect.objectContaining({ slides: expect.arrayContaining([expect.objectContaining({ number: 1 }), expect.objectContaining({ number: 2 })]) }),
      CURRENT_ANIMATION_REGISTRY_VERSION,
      expect.objectContaining({ model: "model" }),
    );
    const content = vi.mocked(generator.generate).mock.calls[0][0].messages[1].content;
    expect(content).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: expect.stringContaining("AUTHORITATIVE DATA FILES") }),
      expect.objectContaining({ filename: "r.txt" }),
      expect.objectContaining({ text: expect.stringContaining("VISUAL TEMPLATE FILES") }),
      expect.objectContaining({ filename: "t.html" }),
    ]));
  });

  it("applies multiple replacements in one repository edit", async () => {
    vi.mocked(generator.generate).mockResolvedValue(aiResponse(JSON.stringify({ slides: [wireSlide(1, [textElement("A")]), wireSlide(2, [textElement("B")])] })));
    await service.edit("user-1", { generationId: stored.id, edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 2, prompt: "B" }] });
    expect(repo.appendStructuredEdit).toHaveBeenCalledOnce();
    const call = vi.mocked(repo.appendStructuredEdit).mock.calls[0][0];
    expect(call.replacements.slides.map((slide) => slide.number).sort()).toEqual([1, 2]);
    expect(call.replacements.nodes.some((node) => (node.props as { text: string }).text === "A")).toBe(true);
  });

  it("rejects incomplete replacement sets without persisting", async () => {
    vi.mocked(generator.generate).mockResolvedValue(aiResponse(JSON.stringify({ slides: [wireSlide(1)] })));
    await expect(service.edit("user-1", { generationId: stored.id, edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 2, prompt: "B" }] })).rejects.toMatchObject({ code: "INVALID_MODEL_OUTPUT" });
    expect(repo.appendStructuredEdit).not.toHaveBeenCalled();
  });

  it("refuses to edit a presentation that has no structured revision yet, without calling the AI provider", async () => {
    vi.mocked(repo.loadCurrentStructuredRevision).mockResolvedValueOnce(null);
    await expect(service.edit("user-1", { generationId: stored.id, edits: [{ slideNumber: 1, prompt: "A" }] })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it("supports undo and reports conflicts", async () => {
    await expect(service.undo("user-1", stored.id, 1)).resolves.toMatchObject({ generation: { currentRevisionNumber: 2 }, undoableSlideNumbers: [1] });
    vi.mocked(repo.undoStructured).mockResolvedValueOnce(null);
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

  it("returns owner detail with the structured revision and undoable slide numbers", async () => {
    await expect(service.detail("user-1", stored.id)).resolves.toEqual({ generation: stored, structuredRevision, undoableSlideNumbers: [1] });
  });

  it("returns owner detail for incomplete lifecycle states without loading structured content", async () => {
    const failed = { ...stored, status: "FAILED" as const };
    vi.mocked(repo.findOwned).mockResolvedValueOnce(failed);
    await expect(service.detail("user-1", stored.id)).resolves.toEqual({ generation: failed, structuredRevision: null, undoableSlideNumbers: [] });
    expect(repo.loadCurrentStructuredRevision).not.toHaveBeenCalled();
  });

  it("deletes through the policy and reports stale deletes", async () => {
    await expect(service.delete("user-1", stored.id)).resolves.toBeUndefined();
    expect(repo.deleteOwned).toHaveBeenCalledWith({ id: stored.id, userId: "user-1" });
    vi.mocked(repo.deleteOwned).mockResolvedValueOnce(false);
    await expect(service.delete("user-1", stored.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("bootstraps a completed blank design without calling the AI provider", async () => {
    await service.bootstrapDesign("user-1", { title: "Board deck", mode: "blank", slideCount: 3 });
    expect(generator.generate).not.toHaveBeenCalled();
    expect(repo.createGeneration).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      title: "Board deck",
      provider: "design",
      modelId: "blank",
      approvedOutline: expect.objectContaining({ slides: expect.arrayContaining([expect.objectContaining({ number: 1 })]) }),
    }));
    const document = vi.mocked(repo.completeStructuredGeneration).mock.calls[0][1];
    expect(document.slides).toHaveLength(3);
    expect(document.slides.every((slide) => slide.topLevelElementIds.length === 0)).toBe(true);
    expect(document.slides.map((slide) => slide.number)).toEqual([1, 2, 3]);
  });

  it("defaults blank bootstrap to a single slide", async () => {
    await service.bootstrapDesign("user-1", { title: "Solo slide", mode: "blank" });
    const document = vi.mocked(repo.completeStructuredGeneration).mock.calls[0][1];
    expect(document.slides).toHaveLength(1);
  });

  it("rejects template bootstrap since no template library exists yet", async () => {
    await expect(service.bootstrapDesign("user-1", { title: "From template", mode: "template", templateId: "123e4567-e89b-12d3-a456-426614174099" }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.createGeneration).not.toHaveBeenCalled();
  });

  it("saves a structured design and enforces the client's expected revision as CAS input", async () => {
    await service.saveDesign("user-1", { generationId: stored.id, slides: [wireSlide(1)], expectedRevision: 1 });
    expect(repo.saveStructuredDesign).toHaveBeenCalledWith(expect.objectContaining({
      expectedRevision: 1,
      document: expect.objectContaining({ slides: expect.arrayContaining([expect.objectContaining({ number: 1 })]) }),
    }));
  });

  it("rejects design saves with element props that fail the registered schema, without persisting", async () => {
    const invalid = [{ number: 1, width: 960, height: 540, elements: [{ type: "text", geometry: { x: 0, y: 0, width: 100, height: 40, zIndex: 0 }, props: { text: "x" }, animation: null }] }];
    await expect(service.saveDesign("user-1", { generationId: stored.id, slides: invalid, expectedRevision: 1 }))
      .rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repo.saveStructuredDesign).not.toHaveBeenCalled();
  });

  it("reports a conflict when the design save loses the revision race", async () => {
    vi.mocked(repo.saveStructuredDesign).mockResolvedValueOnce(null);
    await expect(service.saveDesign("user-1", { generationId: stored.id, slides: [wireSlide(1)], expectedRevision: 1 })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
