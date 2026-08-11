import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AuthError } from "../../auth/domain/auth.errors";
import type { PresentationDetail } from "../application/slide.service";
import type { PresentationPage, PresentationSummary } from "../application/slide.ports";
import { SlideError } from "../domain/slide.errors";

export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json(); }
  catch { throw new SlideError("INVALID_INPUT", "Invalid request body"); }
}

export function parseJsonText(value: string): unknown {
  try { return JSON.parse(value); }
  catch { throw new SlideError("INVALID_INPUT", "Invalid JSON field"); }
}

export async function readFormData(request: Request): Promise<FormData> {
  try { return await request.formData(); }
  catch { throw new SlideError("INVALID_INPUT", "Invalid multipart request"); }
}

export function requireFile(form: FormData, name: string): File {
  const value = form.get(name);
  if (!(value instanceof File)) throw new SlideError("INVALID_INPUT", `Missing ${name} file`);
  return value;
}

export function requireFiles(form: FormData, name: string): File[] {
  const values = form.getAll(name);
  if (!values.length || values.some((value) => !(value instanceof File))) {
    throw new SlideError("INVALID_INPUT", `Missing ${name} files`);
  }
  return values as File[];
}

export function requireText(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || !value.trim()) throw new SlideError("INVALID_INPUT", `Missing ${name}`);
  return value;
}

export function presentationResponse(detail: PresentationDetail) {
  const { generation, structuredRevision, undoableSlideNumbers } = detail;
  return {
    id: generation.id,
    title: generation.title,
    status: generation.status,
    outline: generation.approvedOutline,
    document: structuredRevision,
    revisionNumber: generation.currentRevisionNumber,
    undoableSlideNumbers,
    createdAt: generation.createdAt,
    updatedAt: generation.updatedAt,
    completedAt: generation.completedAt,
    provider: generation.provider,
    modelId: generation.modelId,
    finishReason: generation.finishReason,
    usage: {
      promptTokens: generation.promptTokens,
      completionTokens: generation.completionTokens,
      totalTokens: generation.totalTokens,
    },
  };
}

export function presentationListResponse(page: PresentationPage) {
  return {
    items: page.items.map(presentationSummaryResponse),
    nextCursor: page.nextCursor,
  };
}

function presentationSummaryResponse(presentation: PresentationSummary) {
  return {
    id: presentation.id,
    title: presentation.title,
    status: presentation.status,
    currentRevisionNumber: presentation.currentRevisionNumber,
    createdAt: presentation.createdAt,
    updatedAt: presentation.updatedAt,
    completedAt: presentation.completedAt,
  };
}

export function slideErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) return jsonError("INVALID_INPUT", error.issues[0]?.message ?? "Invalid request", 400);
  if (error instanceof SlideError && error.code === "INVALID_INPUT") return jsonError("INVALID_INPUT", error.message, 400);
  if (error instanceof AuthError) return jsonError("UNAUTHORIZED", "Unauthorized", 401);
  if (error instanceof SlideError) {
    const status = error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : error.code === "RENDER_FAILED" ? 500 : 502;
    return jsonError(error.code, error.message, status);
  }
  return jsonError("INTERNAL_ERROR", "Internal server error", 500);
}

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}
