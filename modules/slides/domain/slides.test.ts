import { describe, expect, it } from "vitest";
import { extractSlides, replaceSlides, validatePresentationHtml, validateReplacementHtml } from "./html";
import { parseModelJson } from "./model-output";
import { editSystemPrompt, generationSystemPrompt, OUTLINE_SYSTEM_PROMPT } from "./prompts";
import { batchEditSchema, editResponseSchema, outlineSchema } from "./slide.schemas";
import { toFilePart } from "./uploads";

const html = "<!doctype html><html><head><style>.x{color:red}</style></head><body><div class=\"slai-slide\" data-slide-number=\"1\">One</div><div class=\"slai-slide\" data-slide-number=\"2\">Two</div></body></html>";

describe("slide domain", () => {
  it("requires contiguous outline numbers and unique batch edits", () => {
    expect(outlineSchema.safeParse({ title: "Deck", slides: [{ number: 2, title: "A", summary: "B" }] }).success).toBe(false);
    expect(batchEditSchema.safeParse({ generationId: "123e4567-e89b-12d3-a456-426614174000", edits: [{ slideNumber: 1, prompt: "A" }, { slideNumber: 1, prompt: "B" }] }).success).toBe(false);
  });
  it("parses fenced JSON and validates its schema", () => {
    expect(parseModelJson("```json\n{\"slides\":[{\"slideNumber\":1,\"html\":\"x\"}]}\n```", editResponseSchema).slides[0].slideNumber).toBe(1);
    expect(() => parseModelJson("not json", outlineSchema)).toThrowError(expect.objectContaining({ code: "INVALID_MODEL_OUTPUT" }));
  });
  it("defines explicit prompt contracts", () => {
    expect(OUTLINE_SYSTEM_PROMPT).toContain("Return JSON only");
    expect(generationSystemPrompt("{}")).toContain("class=\"slai-slide\"");
    expect(editSystemPrompt("{}")).toContain("exactly one replacement");
  });
  it("validates uploads and converts them to base64", async () => {
    await expect(toFilePart(new File(["report"], "report.txt", { type: "text/plain" }), "report")).resolves.toMatchObject({ source: { data: "cmVwb3J0" } });
    await expect(toFilePart(new File([], "empty.txt", { type: "text/plain" }), "report")).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("sanitizes presentations and validates wrapper numbering", () => {
    const clean = validatePresentationHtml(html.replace("One", "<unknown>One</unknown>"), 2);
    expect(clean).not.toContain("unknown");
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
});
