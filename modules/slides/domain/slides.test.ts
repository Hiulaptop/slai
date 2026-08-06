import { describe, expect, it } from "vitest";
import { buildBlankPresentationHtml, extractSlides, replaceSlides, slideNumbers, validatePresentationHtml, validateReplacementHtml } from "./html";
import { parseModelJson } from "./model-output";
import { editSystemPrompt, generationSystemPrompt, OUTLINE_SYSTEM_PROMPT } from "./prompts";
import { approvedOutlineSchema, batchEditSchema, creationMetadataSchema, editResponseSchema, outlineSchema } from "./slide.schemas";
import { assertAggregateUpload, normalizedMediaType, toFilePart } from "./uploads";

const html = "<!doctype html><html><head><style>.x{color:red}</style></head><body><div class=\"slai-slide\" data-slide-number=\"1\">One</div><div class=\"slai-slide\" data-slide-number=\"2\">Two</div></body></html>";

describe("slide domain", () => {
  it("requires contiguous outline numbers and unique batch edits", () => {
    expect(outlineSchema.safeParse({ title: "Deck", slides: [{ number: 2, title: "A", summary: "B" }] }).success).toBe(false);
    expect(batchEditSchema.safeParse({ generationId: "123e4567-e89b-12d3-a456-426614174000", edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 1, prompt: "B" }] }).success).toBe(false);
  });
  it("accepts slide counts above 50 without an arbitrary ceiling", () => {
    const slides = Array.from({ length: 51 }, (_, index) => ({ number: index + 1, title: `Slide ${index + 1}`, summary: "Summary" }));
    expect(approvedOutlineSchema(51).safeParse({ title: "Deck", slides }).success).toBe(true);
    expect(batchEditSchema.safeParse({ generationId: "123e4567-e89b-12d3-a456-426614174000", edits: [{ slideNumber: 51, prompt: "Improve" }] }).success).toBe(true);
    expect(creationMetadataSchema.safeParse({ title: "Deck", prompt: "Prompt", slideCount: 0 }).success).toBe(false);
    expect(approvedOutlineSchema(52).safeParse({ title: "Deck", slides }).success).toBe(false);
  });
  it("parses fenced JSON and validates its schema", () => {
    expect(parseModelJson("```json\n{\"slides\":[{\"slideNumber\":1,\"html\":\"x\"}]}\n```", editResponseSchema).slides[0].slideNumber).toBe(1);
    expect(() => parseModelJson("not json", outlineSchema)).toThrowError(expect.objectContaining({ code: "INVALID_MODEL_OUTPUT" }));
  });
  it("defines explicit prompt contracts", () => {
    expect(OUTLINE_SYSTEM_PROMPT).toContain("Return JSON only");
    expect(OUTLINE_SYSTEM_PROMPT).not.toContain("1-50");
    expect(generationSystemPrompt("{}")).toContain("class=\"slai-slide\"");
    expect(generationSystemPrompt("{}")).toContain("every PDF page as a rendered image");
    expect(generationSystemPrompt("{}")).toContain("Never invent, estimate, extrapolate");
    expect(generationSystemPrompt("{}")).toContain("never factual sources");
    expect(generationSystemPrompt("{}")).toContain("HTML and CSS only");
    expect(generationSystemPrompt("{}")).toContain("height:100%");
    expect(generationSystemPrompt("{}")).toContain("no child may render outside");
    expect(editSystemPrompt("{}")).toContain("exactly one replacement");
    expect(editSystemPrompt("{}")).toContain("no scrollbars or visual overflow");
  });
  it("validates uploads and converts them to base64", async () => {
    await expect(toFilePart(new File(["report"], "report.txt", { type: "text/plain" }), "report")).resolves.toMatchObject({ source: { data: "cmVwb3J0" } });
    await expect(toFilePart(new File(["%PDF"], "template.pdf", { type: "application/pdf" }), "template")).resolves.toMatchObject({ source: { mediaType: "application/pdf" } });
    expect(normalizedMediaType(new File(["%PDF"], "template.pdf"))).toBe("application/pdf");
    expect(normalizedMediaType(new File(["%PDF"], "template.pdf", { type: "application/octet-stream" }))).toBe("application/pdf");
    expect(normalizedMediaType(new File(["text"], "notes.md"))).toBe("text/markdown");
    await expect(toFilePart(new File([], "empty.txt", { type: "text/plain" }), "report")).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(() => assertAggregateUpload([{ size: 101 * 1024 * 1024 } as File])).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
  });
  it("sanitizes presentations and validates wrapper numbering", () => {
    const clean = validatePresentationHtml(html.replace("One", "<unknown>One</unknown>"), 2);
    expect(slideNumbers(clean)).toEqual([1, 2]);
    expect(clean).toContain('id="slai-layout-constraints"');
    expect(clean).toContain("height:100%!important");
    expect(clean).toContain("overflow:hidden!important");
    expect(clean).not.toContain("unknown");
    expect(() => validatePresentationHtml(html.replace("<style>.x{color:red}</style>", ""), 2)).toThrow();
    expect(() => validatePresentationHtml(html.replace("One", '<a href="javascript:bad">One</a>'), 2)).toThrow();
    expect(() => validatePresentationHtml(html.replace("One", "<script>x</script>One"), 2)).toThrow();
    expect(() => validatePresentationHtml(html.replace('data-slide-number="2"', 'data-slide-number="3"'), 2)).toThrow();
  });
  it("validates replacements and preserves non-target slides", () => {
    const replacement = validateReplacementHtml('<div class="slai-slide" data-slide-number="2">Changed</div>', 2);
    const updated = replaceSlides(html, new Map([[2, replacement]]));
    expect(extractSlides(updated, [1])[1]).toContain("One");
    expect(extractSlides(updated, [2])[2]).toContain("Changed");
    expect(() => validateReplacementHtml('<div class="slai-slide" data-slide-number="1">Wrong</div>', 2)).toThrow();
  });
  it("builds a sanitized blank presentation with contiguous slide wrappers", () => {
    const blank = buildBlankPresentationHtml(3);
    expect(slideNumbers(blank)).toEqual([1, 2, 3]);
    expect(blank).toContain('id="slai-layout-constraints"');
    expect(blank).not.toContain("<script");
  });
  it("defaults a single-slide blank document to slide number 1", () => {
    expect(slideNumbers(buildBlankPresentationHtml(1))).toEqual([1]);
  });
});
