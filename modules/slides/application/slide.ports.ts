import type { AIRequest } from "../../ai/domain/request.schema";
import type { AdapterRequestOptions, AIResponse } from "../../ai/infrastructure/cliproxy/adapter.types";
import type { BatchEdit, SlideOutline } from "../domain/slide.schemas";

export interface AIGenerator {
  generate(request: AIRequest, options?: AdapterRequestOptions): Promise<AIResponse>;
}

export interface StoredPresentation {
  id: string;
  userId: string | null;
  status: "PROCESSING" | "COMPLETED" | "FAILED" | "PENDING";
  approvedOutline: unknown;
  htmlContent: string | null;
  currentRevisionNumber: number | null;
  nextRevisionNumber: number;
  provider: string;
  modelId: string;
  finishReason: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
}

export interface SlideRepository {
  createGeneration(input: { userId: string; title: string; provider: string; modelId: string; requestPayload: unknown; approvedOutline: SlideOutline }): Promise<StoredPresentation>;
  failGeneration(id: string, code: string, message: string): Promise<void>;
  completeGeneration(id: string, html: string, response: AIResponse): Promise<StoredPresentation>;
  findOwned(id: string, userId: string): Promise<StoredPresentation | null>;
  appendEdit(input: { generation: StoredPresentation; html: string; edits: BatchEdit["edits"] }): Promise<StoredPresentation | null>;
  undo(generation: StoredPresentation): Promise<StoredPresentation | null>;
}
