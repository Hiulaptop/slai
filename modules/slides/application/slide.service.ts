import type { AIResponse } from "../../ai/infrastructure/cliproxy/adapter.types";
import { parseModelJson } from "../domain/model-output";
import { editSystemPrompt, generationSystemPrompt, OUTLINE_SYSTEM_PROMPT } from "../domain/prompts";
import { SlideError, type SlideErrorCode } from "../domain/slide.errors";
import { approvedOutlineSchema, outlineSchema, type BatchEdit, type DesignBootstrapInput, type DesignSaveInput, type SlideOutline } from "../domain/slide.schemas";
import { assertAggregateUpload, fileMetadataList, toFileParts } from "../domain/uploads";
import { decodePresentationCursor, encodePresentationCursor } from "../domain/presentation-cursor";
import type { PresentationListQuery } from "../domain/slide.schemas";
import { CURRENT_ANIMATION_REGISTRY_VERSION } from "../domain/structured/animation-registry";
import { flattenWireSlides, structuredSlidesResponseSchema, type FlattenedDocument, type WireSlide } from "../domain/structured/compose";
import { validateStructuredCommand } from "../domain/structured/graph-validator";
import type { StructuredRevision } from "../domain/structured/types";
import { PresentationAccessPolicy } from "./presentation-access.policy";
import type { AIGenerator, PresentationPage, SlideCreationInput, SlideOutlineInput, SlideRepository, StoredPresentation } from "./slide.ports";

interface AIConfiguration {
  generator: AIGenerator;
  provider: string;
  modelId: string;
}

type AIConfigurationResolver = () => AIConfiguration;

export interface PresentationDetail {
  generation: StoredPresentation;
  structuredRevision: StructuredRevision | null;
  undoableSlideNumbers: number[];
}

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

  async detail(userId: string, generationId: string): Promise<PresentationDetail> {
    const generation = await this.access.require(generationId, userId, "read");
    if (generation.status !== "COMPLETED") return { generation, structuredRevision: null, undoableSlideNumbers: [] };
    return this.withStructuredDetail(generation);
  }

  // Owner-authorized read for preview/download rendering (see
  // modules/slides/domain/structured/render.ts). Reuses the same "read"
  // access check as detail() so a missing or non-owned generation returns
  // the identical NOT_FOUND either way - see design.md's "same status 404
  // response" requirement.
  async render(userId: string, generationId: string): Promise<StructuredRevision> {
    const generation = await this.access.require(generationId, userId, "read");
    if (generation.status !== "COMPLETED") throw new SlideError("CONFLICT", "Presentation is not ready to render");
    const structuredRevision = await this.repository.loadCurrentStructuredRevision(generation);
    if (!structuredRevision) throw new SlideError("CONFLICT", "This presentation has not been migrated to the structured format yet");
    return structuredRevision;
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
  async generate(userId: string, input: SlideCreationInput & { outline: SlideOutline }, signal?: AbortSignal): Promise<PresentationDetail> {
    const ai = this.resolveAI();
    assertAggregateUpload([...input.dataFiles, ...input.templateFiles]);
    const parsedOutline = approvedOutlineSchema(input.slideCount).parse(input.outline);
    const dataParts = await toFileParts(input.dataFiles, "report");
    const templateParts = await toFileParts(input.templateFiles, "template");
    const generation = await this.repository.createGeneration({ userId, title: input.title, provider: ai.provider, modelId: ai.modelId, approvedOutline: parsedOutline, requestPayload: { title: input.title, prompt: input.prompt, slideCount: input.slideCount, dataFiles: fileMetadataList(input.dataFiles), templateFiles: fileMetadataList(input.templateFiles), outline: parsedOutline } });
    try {
      const response = await this.callAI(ai.generator, { modelId: ai.modelId, messages: [{ role: "system", content: generationSystemPrompt(JSON.stringify(parsedOutline)) }, { role: "user", content: [{ type: "text", text: creationInstruction(input) }, { type: "text", text: "AUTHORITATIVE DATA FILES follow. Every factual claim, name, date, and number must come from these files." }, ...dataParts, { type: "text", text: "VISUAL TEMPLATE FILES follow. Use them only for visual design; never treat their text or numbers as presentation facts." }, ...templateParts] }], temperature: 0.4, responseFormat: "json_object" }, signal);
      const parsed = parseModelJson(response.text, structuredSlidesResponseSchema);
      if (parsed.slides.length !== parsedOutline.slides.length) throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned an unexpected slide count");
      const document = this.parseStructuredSlides(parsed.slides, CURRENT_ANIMATION_REGISTRY_VERSION, "INVALID_MODEL_OUTPUT", true);
      const completed = await this.repository.completeStructuredGeneration(generation.id, document, CURRENT_ANIMATION_REGISTRY_VERSION, response);
      return this.withStructuredDetail(completed);
    } catch (error) {
      await this.repository.failGeneration(generation.id, error instanceof SlideError ? error.code : "PROVIDER_ERROR", "Slide generation failed");
      throw error;
    }
  }
  async bootstrapDesign(userId: string, input: DesignBootstrapInput): Promise<PresentationDetail> {
    if (input.mode === "template") {
      throw new SlideError("INVALID_INPUT", "Template-based design projects are not available yet");
    }
    const slideCount = input.slideCount ?? 1;
    const outline: SlideOutline = {
      title: input.title,
      slides: Array.from({ length: slideCount }, (_, index) => ({
        number: index + 1,
        title: `Slide ${index + 1}`,
        summary: "Untitled slide",
      })),
    };
    const document: FlattenedDocument = {
      nodes: [],
      children: [],
      slides: Array.from({ length: slideCount }, (_, index) => ({ number: index + 1, width: 960, height: 540, props: {}, topLevelElementIds: [] })),
    };
    const generation = await this.repository.createGeneration({
      userId,
      title: input.title,
      provider: "design",
      modelId: "blank",
      approvedOutline: outline,
      requestPayload: { kind: "design-bootstrap", mode: input.mode, slideCount },
    });
    const response: AIResponse = { text: "", model: "blank", finishReason: "design_bootstrap", usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
    const completed = await this.repository.completeStructuredGeneration(generation.id, document, CURRENT_ANIMATION_REGISTRY_VERSION, response);
    return this.withStructuredDetail(completed);
  }
  async saveDesign(userId: string, input: DesignSaveInput): Promise<PresentationDetail> {
    const generation = await this.access.require(input.generationId, userId, "mutate");
    const document = this.parseStructuredSlides(input.slides, CURRENT_ANIMATION_REGISTRY_VERSION, "INVALID_INPUT", true);
    const updated = await this.repository.saveStructuredDesign({ generation, document, animationRegistryVersion: CURRENT_ANIMATION_REGISTRY_VERSION, expectedRevision: input.expectedRevision });
    if (!updated) throw new SlideError("CONFLICT", "Presentation changed concurrently");
    return this.withStructuredDetail(updated);
  }
  async edit(userId: string, input: BatchEdit, signal?: AbortSignal): Promise<PresentationDetail> {
    const ai = this.resolveAI();
    const generation = await this.access.require(input.generationId, userId, "mutate");
    const outline = outlineSchema.parse(generation.approvedOutline);
    const numbers = input.edits.map((edit) => edit.slideNumber);
    if (numbers.some((number) => number > outline.slides.length)) throw new SlideError("NOT_FOUND", "Slide not found");
    const current = await this.repository.loadCurrentStructuredRevision(generation);
    if (!current) throw new SlideError("CONFLICT", "This presentation has not been migrated to the structured format yet");
    const selected = current.slides.filter((slide) => numbers.includes(slide.number));
    const context = JSON.stringify({ edits: input.edits, selected, outline: outline.slides.filter((slide) => numbers.includes(slide.number)) });
    const response = await this.callAI(ai.generator, { modelId: ai.modelId, messages: [{ role: "system", content: editSystemPrompt(context) }, { role: "user", content: "Apply the requested slide edits." }], temperature: 0.3, responseFormat: "json_object" }, signal);
    const parsed = parseModelJson(response.text, structuredSlidesResponseSchema);
    const returned = parsed.slides.map((slide) => slide.number);
    if (returned.length !== numbers.length || new Set(returned).size !== returned.length || numbers.some((number) => !returned.includes(number))) throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned an invalid replacement set");
    const replacements = this.parseStructuredSlides(parsed.slides, current.animationRegistryVersion, "INVALID_MODEL_OUTPUT", false);
    const updated = await this.repository.appendStructuredEdit({ generation, replacements, animationRegistryVersion: current.animationRegistryVersion, editRequest: input.edits });
    if (!updated) throw new SlideError("CONFLICT", "Presentation changed concurrently");
    return this.withStructuredDetail(updated);
  }
  async undo(userId: string, generationId: string, slideNumber: number): Promise<PresentationDetail> {
    const generation = await this.access.require(generationId, userId, "mutate");
    const outline = outlineSchema.parse(generation.approvedOutline);
    if (slideNumber > outline.slides.length) throw new SlideError("NOT_FOUND", "Slide not found");
    const restored = await this.repository.undoStructured(generation, slideNumber);
    if (!restored) throw new SlideError("CONFLICT", "Nothing to undo or presentation changed concurrently");
    return this.withStructuredDetail(restored);
  }
  private async callAI(ai: AIGenerator, request: Parameters<AIGenerator["generate"]>[0], signal?: AbortSignal): Promise<AIResponse> {
    try { return await ai.generate(request, { signal }); }
    catch (cause) { if (cause instanceof SlideError) throw cause; throw new SlideError("PROVIDER_ERROR", "AI provider request failed", { cause }); }
  }
  private async withStructuredDetail(generation: StoredPresentation): Promise<PresentationDetail> {
    const structuredRevision = await this.repository.loadCurrentStructuredRevision(generation);
    const undoableSlideNumbers = structuredRevision ? await this.repository.undoableStructuredSlideNumbers(generation) : [];
    return { generation, structuredRevision, undoableSlideNumbers };
  }
  // Flattens the AI/editor-authored nested wire slides into the flat graph
  // the repository requires, then runs full structural validation. Any
  // failure - from the flattener or from the validator - is re-thrown with
  // `errorCode` so a bad AI response maps to a provider fault (502) while a
  // bad editor-authored command maps to a caller fault (400); see
  // slide.errors.ts and route-helpers.ts's status mapping.
  private parseStructuredSlides(wireSlides: WireSlide[], animationRegistryVersion: number, errorCode: SlideErrorCode, requireContiguousFromOne: boolean): FlattenedDocument {
    const flattened = flattenWireSlides(wireSlides, animationRegistryVersion, errorCode);
    try {
      validateStructuredCommand(flattened.nodes, flattened.children, flattened.slides, { requireContiguousFromOne });
    } catch (error) {
      if (error instanceof SlideError && error.code !== errorCode) throw new SlideError(errorCode, error.message, { cause: error });
      throw error;
    }
    return flattened;
  }
}

function creationInstruction(input: Pick<SlideCreationInput, "title" | "prompt" | "slideCount">): string {
  return `Presentation title: ${input.title}\nRequested slides: ${input.slideCount}\nUser direction: ${input.prompt}`;
}
