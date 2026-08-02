import type { AIResponse } from "../../ai/infrastructure/cliproxy/adapter.types";
import { extractSlides, replaceSlides, validatePresentationHtml, validateReplacementHtml } from "../domain/html";
import { parseModelJson } from "../domain/model-output";
import { editSystemPrompt, generationSystemPrompt, OUTLINE_SYSTEM_PROMPT } from "../domain/prompts";
import { SlideError } from "../domain/slide.errors";
import { approvedOutlineSchema, editResponseSchema, outlineSchema, type BatchEdit, type SlideOutline } from "../domain/slide.schemas";
import { assertAggregateUpload, fileMetadataList, toFileParts } from "../domain/uploads";
import { decodePresentationCursor, encodePresentationCursor } from "../domain/presentation-cursor";
import type { PresentationListQuery } from "../domain/slide.schemas";
import { PresentationAccessPolicy } from "./presentation-access.policy";
import type { AIGenerator, PresentationPage, SlideCreationInput, SlideOutlineInput, SlideRepository } from "./slide.ports";

interface AIConfiguration {
  generator: AIGenerator;
  provider: string;
  modelId: string;
}

type AIConfigurationResolver = () => AIConfiguration;

export class SlideService {
  private readonly access: PresentationAccessPolicy;
  private readonly resolveAI: AIConfigurationResolver;

  constructor(
    private repository: SlideRepository,
    ai: AIGenerator | AIConfigurationResolver,
    provider?: string,
    modelId?: string,
  ) {
    this.access = new PresentationAccessPolicy(repository);
    this.resolveAI = typeof ai === "function"
      ? ai
      : () => ({ generator: ai, provider: provider!, modelId: modelId! });
  }

  get provider(): string {
    return this.resolveAI().provider;
  }

  get modelId(): string {
    return this.resolveAI().modelId;
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

  async detail(userId: string, generationId: string) {
    const generation = await this.access.require(generationId, userId, "read");
    return { generation, undoableSlideNumbers: generation.status === "COMPLETED" ? await this.repository.undoableSlideNumbers(generation) : [] };
  }

  async delete(userId: string, generationId: string): Promise<void> {
    await this.access.require(generationId, userId, "delete");
    if (!(await this.repository.deleteOwned({ id: generationId, userId }))) {
      throw new SlideError("CONFLICT", "Presentation changed concurrently");
    }
  }
  async suggestOutline(input: SlideOutlineInput, signal?: AbortSignal): Promise<SlideOutline> {
    const ai = this.resolveAI();
    assertAggregateUpload(input.dataFiles);
    const dataParts = await toFileParts(input.dataFiles, "report");
    const response = await this.callAI(ai.generator, { modelId: ai.modelId, messages: [{ role: "system", content: OUTLINE_SYSTEM_PROMPT }, { role: "user", content: [{ type: "text", text: creationInstruction(input) }, { type: "text", text: "AUTHORITATIVE DATA FILES follow. Use these files as the only factual source." }, ...dataParts] }], temperature: 0.2, responseFormat: "json_object" }, signal);
    return approvedOutlineSchema(input.slideCount).parse(parseModelJson(response.text, outlineSchema));
  }
  async generate(userId: string, input: SlideCreationInput & { outline: SlideOutline }, signal?: AbortSignal) {
    const ai = this.resolveAI();
    assertAggregateUpload([...input.dataFiles, ...input.templateFiles]);
    const parsedOutline = approvedOutlineSchema(input.slideCount).parse(input.outline);
    const dataParts = await toFileParts(input.dataFiles, "report");
    const templateParts = await toFileParts(input.templateFiles, "template");
    const generation = await this.repository.createGeneration({ userId, title: input.title, provider: ai.provider, modelId: ai.modelId, approvedOutline: parsedOutline, requestPayload: { title: input.title, prompt: input.prompt, slideCount: input.slideCount, dataFiles: fileMetadataList(input.dataFiles), templateFiles: fileMetadataList(input.templateFiles), outline: parsedOutline } });
    try {
      const response = await this.callAI(ai.generator, { modelId: ai.modelId, messages: [{ role: "system", content: generationSystemPrompt(JSON.stringify(parsedOutline)) }, { role: "user", content: [{ type: "text", text: creationInstruction(input) }, { type: "text", text: "AUTHORITATIVE DATA FILES follow. Every factual claim, name, date, and number must come from these files." }, ...dataParts, { type: "text", text: "VISUAL TEMPLATE FILES follow. Use them only for visual design; never treat their text or numbers as presentation facts." }, ...templateParts] }], temperature: 0.4 }, signal);
      return this.repository.completeGeneration(generation.id, validatePresentationHtml(response.text, parsedOutline.slides.length), response);
    } catch (error) {
      await this.repository.failGeneration(generation.id, error instanceof SlideError ? error.code : "PROVIDER_ERROR", "Slide generation failed");
      throw error;
    }
  }
  async edit(userId: string, input: BatchEdit, signal?: AbortSignal) {
    const ai = this.resolveAI();
    const generation = await this.access.require(input.generationId, userId, "mutate");
    const outline = outlineSchema.parse(generation.approvedOutline);
    const numbers = input.edits.map((edit) => edit.slideNumber);
    if (numbers.some((number) => number > outline.slides.length)) throw new SlideError("NOT_FOUND", "Slide not found");
    const selected = extractSlides(generation.htmlContent!, numbers);
    const context = JSON.stringify({ edits: input.edits, selected, outline: outline.slides.filter((slide) => numbers.includes(slide.number)), presentation: generation.htmlContent });
    const response = await this.callAI(ai.generator, { modelId: ai.modelId, messages: [{ role: "system", content: editSystemPrompt(context) }, { role: "user", content: "Apply the requested slide edits." }], temperature: 0.3, responseFormat: "json_object" }, signal);
    const parsed = parseModelJson(response.text, editResponseSchema);
    const returned = parsed.slides.map((slide) => slide.slideNumber);
    if (returned.length !== numbers.length || new Set(returned).size !== returned.length || numbers.some((number) => !returned.includes(number))) throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned an invalid replacement set");
    const replacements = new Map(parsed.slides.map((slide) => [slide.slideNumber, validateReplacementHtml(slide.html, slide.slideNumber)]));
    const updated = await this.repository.appendEdit({ generation, html: replaceSlides(generation.htmlContent!, replacements), edits: input.edits });
    if (!updated) throw new SlideError("CONFLICT", "Presentation changed concurrently");
    return updated;
  }
  async undo(userId: string, generationId: string, slideNumber: number) {
    const generation = await this.access.require(generationId, userId, "mutate");
    const outline = outlineSchema.parse(generation.approvedOutline);
    if (slideNumber > outline.slides.length) throw new SlideError("NOT_FOUND", "Slide not found");
    const restored = await this.repository.undo(generation, slideNumber);
    if (!restored) throw new SlideError("CONFLICT", "Nothing to undo or presentation changed concurrently");
    return { generation: restored, undoableSlideNumbers: await this.repository.undoableSlideNumbers(restored) };
  }
  private async callAI(ai: AIGenerator, request: Parameters<AIGenerator["generate"]>[0], signal?: AbortSignal): Promise<AIResponse> {
    try { return await ai.generate(request, { signal }); }
    catch (cause) { if (cause instanceof SlideError) throw cause; throw new SlideError("PROVIDER_ERROR", "AI provider request failed", { cause }); }
  }
}

function creationInstruction(input: Pick<SlideCreationInput, "title" | "prompt" | "slideCount">): string {
  return `Presentation title: ${input.title}\nRequested slides: ${input.slideCount}\nUser direction: ${input.prompt}`;
}
