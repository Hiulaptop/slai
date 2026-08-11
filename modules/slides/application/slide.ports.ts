import type { AIRequest } from "../../ai/domain/request.schema";
import type { AdapterRequestOptions, AIResponse } from "../../ai/infrastructure/cliproxy/adapter.types";
import type { BatchEdit, CreationMetadata, SlideOutline } from "../domain/slide.schemas";
import type { PresentationCursor } from "../domain/slide.schemas";
import type { FlattenedDocument } from "../domain/structured/compose";
import type { StructuredRevision } from "../domain/structured/types";

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
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export type PresentationAccessRecord = StoredPresentation;

export interface PresentationSummary {
  id: string;
  title: string | null;
  status: StoredPresentation["status"];
  currentRevisionNumber: number | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface PresentationPage {
  items: PresentationSummary[];
  nextCursor: string | null;
}

export interface SlideCreationInput extends CreationMetadata {
  dataFiles: File[];
  templateFiles: File[];
  outline?: SlideOutline;
}

export type SlideOutlineInput = Omit<SlideCreationInput, "outline" | "templateFiles">;

export interface SlideRepository {
  createGeneration(input: { userId: string; title: string; provider: string; modelId: string; requestPayload: unknown; approvedOutline: SlideOutline }): Promise<StoredPresentation>;
  failGeneration(id: string, code: string, message: string): Promise<void>;
  completeGeneration(id: string, html: string, response: AIResponse): Promise<StoredPresentation>;
  findOwned(id: string, userId: string): Promise<StoredPresentation | null>;
  listOwned(input: { userId: string; limit: number; cursor?: PresentationCursor }): Promise<PresentationSummary[]>;
  deleteOwned(input: { id: string; userId: string }): Promise<boolean>;
  appendEdit(input: { generation: StoredPresentation; html: string; edits: BatchEdit["edits"] }): Promise<StoredPresentation | null>;
  saveDesign(input: { generation: StoredPresentation; html: string; expectedRevision: number | null }): Promise<StoredPresentation | null>;
  undo(generation: StoredPresentation, slideNumber: number): Promise<StoredPresentation | null>;
  undoableSlideNumbers(generation: StoredPresentation): Promise<number[]>;

  // Structured revision operations - source of truth for every new
  // presentation (see design.md); the methods above remain only for
  // generations created before this change.
  loadCurrentStructuredRevision(generation: StoredPresentation): Promise<StructuredRevision | null>;
  completeStructuredGeneration(id: string, document: FlattenedDocument, animationRegistryVersion: number, response: AIResponse): Promise<StoredPresentation>;
  saveStructuredDesign(input: { generation: StoredPresentation; document: FlattenedDocument; animationRegistryVersion: number; expectedRevision: number | null }): Promise<StoredPresentation | null>;
  appendStructuredEdit(input: { generation: StoredPresentation; replacements: FlattenedDocument; animationRegistryVersion: number; editRequest: unknown }): Promise<StoredPresentation | null>;
  undoStructured(generation: StoredPresentation, slideNumber: number): Promise<StoredPresentation | null>;
  undoableStructuredSlideNumbers(generation: StoredPresentation): Promise<number[]>;
}
