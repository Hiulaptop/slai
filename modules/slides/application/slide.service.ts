import type { AIResponse } from "../../ai/infrastructure/cliproxy/adapter.types";
import { extractSlides, replaceSlides, validatePresentationHtml, validateReplacementHtml } from "../domain/html";
import { parseModelJson } from "../domain/model-output";
import { editSystemPrompt, generationSystemPrompt, OUTLINE_SYSTEM_PROMPT } from "../domain/prompts";
import { SlideError } from "../domain/slide.errors";
import { editResponseSchema, outlineSchema, type BatchEdit, type SlideOutline } from "../domain/slide.schemas";
import { fileMetadata, toFilePart } from "../domain/uploads";
import { decodePresentationCursor, encodePresentationCursor } from "../domain/presentation-cursor";
import type { PresentationListQuery } from "../domain/slide.schemas";
import { PresentationAccessPolicy } from "./presentation-access.policy";
import type { AIGenerator, PresentationPage, SlideRepository } from "./slide.ports";

export class SlideService {
  private readonly access: PresentationAccessPolicy;

  constructor(private repository: SlideRepository, private ai: AIGenerator, readonly provider: string, readonly modelId: string) {
    this.access = new PresentationAccessPolicy(repository);
  }

  async list(userId: string, query: PresentationListQuery): Promise<PresentationPage> {
    const cursor = query.cursor
      ? decodePresentationCursor(query.cursor)
      : undefined;
    const rows = await this.repository.listOwned({
      userId,
      limit: query.limit,
      ...(cursor ? { cursor } : {}),
    });
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        hasMore && last
          ? encodePresentationCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    };
  }

  detail(userId: string, generationId: string) {
    return this.access.require(generationId, userId, "read");
  }

  async delete(userId: string, generationId: string): Promise<void> {
    await this.access.require(generationId, userId, "delete");
    if (!(await this.repository.deleteOwned({ id: generationId, userId }))) {
      throw new SlideError("CONFLICT", "Presentation changed concurrently");
    }
  }
  async suggestOutline(report: File, signal?: AbortSignal): Promise<SlideOutline> {
    const response = await this.callAI({ modelId: this.modelId, messages: [{ role: "system", content: OUTLINE_SYSTEM_PROMPT }, { role: "user", content: [{ type: "text", text: "Create an outline from this report." }, await toFilePart(report, "report")] }], temperature: 0.2, responseFormat: "json_object" }, signal);
    return parseModelJson(response.text, outlineSchema);
  }
  async generate(userId: string, report: File, template: File, outline: SlideOutline, signal?: AbortSignal) {
    const parsedOutline = outlineSchema.parse(outline);
    const reportPart = await toFilePart(report, "report");
    const templatePart = await toFilePart(template, "template");
    const generation = await this.repository.createGeneration({ userId, title: parsedOutline.title, provider: this.provider, modelId: this.modelId, approvedOutline: parsedOutline, requestPayload: { report: fileMetadata(report), template: fileMetadata(template), outline: parsedOutline } });
    try {
      const response = await this.callAI({ modelId: this.modelId, messages: [{ role: "system", content: generationSystemPrompt(JSON.stringify(parsedOutline)) }, { role: "user", content: [{ type: "text", text: "Generate the approved presentation." }, reportPart, templatePart] }], temperature: 0.4 }, signal);
      return this.repository.completeGeneration(generation.id, validatePresentationHtml(response.text, parsedOutline.slides.length), response);
    } catch (error) {
      await this.repository.failGeneration(generation.id, error instanceof SlideError ? error.code : "PROVIDER_ERROR", "Slide generation failed");
      throw error;
    }
  }
  async edit(userId: string, input: BatchEdit, signal?: AbortSignal) {
    const generation = await this.access.require(input.generationId, userId, "mutate");
    const outline = outlineSchema.parse(generation.approvedOutline);
    const numbers = input.edits.map((edit) => edit.slideNumber);
    if (numbers.some((number) => number > outline.slides.length)) throw new SlideError("NOT_FOUND", "Slide not found");
    const selected = extractSlides(generation.htmlContent!, numbers);
    const context = JSON.stringify({ edits: input.edits, selected, outline: outline.slides.filter((slide) => numbers.includes(slide.number)), presentation: generation.htmlContent });
    const response = await this.callAI({ modelId: this.modelId, messages: [{ role: "system", content: editSystemPrompt(context) }, { role: "user", content: "Apply the requested slide edits." }], temperature: 0.3, responseFormat: "json_object" }, signal);
    const parsed = parseModelJson(response.text, editResponseSchema);
    const returned = parsed.slides.map((slide) => slide.slideNumber);
    if (returned.length !== numbers.length || new Set(returned).size !== returned.length || numbers.some((number) => !returned.includes(number))) throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned an invalid replacement set");
    const replacements = new Map(parsed.slides.map((slide) => [slide.slideNumber, validateReplacementHtml(slide.html, slide.slideNumber)]));
    const updated = await this.repository.appendEdit({ generation, html: replaceSlides(generation.htmlContent!, replacements), edits: input.edits });
    if (!updated) throw new SlideError("CONFLICT", "Presentation changed concurrently");
    return updated;
  }
  async undo(userId: string, generationId: string) {
    const generation = await this.access.require(generationId, userId, "mutate");
    const restored = await this.repository.undo(generation);
    if (!restored) throw new SlideError("CONFLICT", "Nothing to undo or presentation changed concurrently");
    return restored;
  }
  private async callAI(request: Parameters<AIGenerator["generate"]>[0], signal?: AbortSignal): Promise<AIResponse> {
    try { return await this.ai.generate(request, { signal }); }
    catch (cause) { if (cause instanceof SlideError) throw cause; throw new SlideError("PROVIDER_ERROR", "AI provider request failed", { cause }); }
  }
}
