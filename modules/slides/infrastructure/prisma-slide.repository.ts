import type { Prisma } from "../../../generated/prisma/client";
import { db } from "../../database/infrastructure/client";
import type { SlideRepository, StoredPresentation } from "../application/slide.ports";
import { extractSlides, replaceSlides, slideNumbers } from "../domain/html";

const select = {
  id: true, userId: true, status: true, approvedOutline: true, htmlContent: true,
  currentRevisionNumber: true, nextRevisionNumber: true, provider: true, modelId: true,
  finishReason: true, promptTokens: true, completionTokens: true, totalTokens: true,
  title: true, createdAt: true, updatedAt: true, completedAt: true,
} as const;

const summarySelect = {
  id: true,
  title: true,
  status: true,
  currentRevisionNumber: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
} as const;

export class PrismaSlideRepository implements SlideRepository {
  createGeneration(input: Parameters<SlideRepository["createGeneration"]>[0]) {
    return db.slideGeneration.create({ data: { ...input, status: "PROCESSING", requestPayload: input.requestPayload as Prisma.InputJsonValue, approvedOutline: input.approvedOutline as Prisma.InputJsonValue, startedAt: new Date() }, select });
  }
  async failGeneration(id: string, errorCode: string, errorMessage: string) {
    await db.slideGeneration.update({ where: { id }, data: { status: "FAILED", errorCode, errorMessage, completedAt: new Date() } });
  }
  completeGeneration(id: string, html: string, response: Parameters<SlideRepository["completeGeneration"]>[2]) {
    return db.$transaction(async (tx) => {
      await tx.slideRevision.create({ data: { slideGenerationId: id, revisionNumber: 1, operation: "GENERATE", changedSlideNumbers: slideNumbers(html), htmlContent: html } });
      return tx.slideGeneration.update({ where: { id }, data: { status: "COMPLETED", htmlContent: html, responsePayload: { model: response.model } as Prisma.InputJsonValue, finishReason: response.finishReason, promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens, totalTokens: response.usage.totalTokens, currentRevisionNumber: 1, nextRevisionNumber: 2, completedAt: new Date() }, select });
    });
  }
  findOwned(id: string, userId: string) { return db.slideGeneration.findFirst({ where: { id, userId }, select }); }
  listOwned(input: Parameters<SlideRepository["listOwned"]>[0]) {
    return db.slideGeneration.findMany({
      where: {
        userId: input.userId,
        ...(input.cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(input.cursor.createdAt) } },
                {
                  createdAt: new Date(input.cursor.createdAt),
                  id: { lt: input.cursor.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      select: summarySelect,
    });
  }
  async deleteOwned(input: Parameters<SlideRepository["deleteOwned"]>[0]) {
    const deleted = await db.slideGeneration.deleteMany({
      where: {
        id: input.id,
        userId: input.userId,
        status: { not: "PROCESSING" },
      },
    });
    return deleted.count === 1;
  }
  appendEdit(input: Parameters<SlideRepository["appendEdit"]>[0]) {
    return db.$transaction(async (tx) => {
      const updated = await tx.slideGeneration.updateMany({ where: { id: input.generation.id, userId: input.generation.userId, status: "COMPLETED", currentRevisionNumber: input.generation.currentRevisionNumber, nextRevisionNumber: input.generation.nextRevisionNumber }, data: { htmlContent: input.html, currentRevisionNumber: input.generation.nextRevisionNumber, nextRevisionNumber: { increment: 1 } } });
      if (updated.count !== 1) return null;
      await tx.slideRevision.create({ data: { slideGenerationId: input.generation.id, revisionNumber: input.generation.nextRevisionNumber, parentRevisionNumber: input.generation.currentRevisionNumber, operation: "EDIT", editRequest: input.edits as Prisma.InputJsonValue, changedSlideNumbers: input.edits.map((edit) => edit.slideNumber), htmlContent: input.html } });
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: input.generation.id }, select });
    });
  }
  saveDesign(input: Parameters<SlideRepository["saveDesign"]>[0]) {
    return db.$transaction(async (tx) => {
      const updated = await tx.slideGeneration.updateMany({
        where: {
          id: input.generation.id,
          userId: input.generation.userId,
          status: "COMPLETED",
          currentRevisionNumber: input.expectedRevision,
          nextRevisionNumber: input.generation.nextRevisionNumber,
        },
        data: {
          htmlContent: input.html,
          currentRevisionNumber: input.generation.nextRevisionNumber,
          nextRevisionNumber: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;
      await tx.slideRevision.create({
        data: {
          slideGenerationId: input.generation.id,
          revisionNumber: input.generation.nextRevisionNumber,
          parentRevisionNumber: input.expectedRevision,
          operation: "EDIT",
          editRequest: undefined,
          changedSlideNumbers: slideNumbers(input.html),
          htmlContent: input.html,
        },
      });
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: input.generation.id }, select });
    });
  }
  undo(generation: StoredPresentation, slideNumber: number) {
    return db.$transaction(async (tx) => {
      if (generation.currentRevisionNumber === null) return null;
      const revisions = await tx.slideRevision.findMany({ where: { slideGenerationId: generation.id }, orderBy: { revisionNumber: "desc" } });
      const target = previousSlideRevision(revisions, generation.currentRevisionNumber, slideNumber, generation.htmlContent!);
      if (!target) return null;
      const replacement = extractSlides(target.htmlContent, [slideNumber])[slideNumber];
      const html = replaceSlides(generation.htmlContent!, new Map([[slideNumber, replacement]]));
      const updated = await tx.slideGeneration.updateMany({ where: { id: generation.id, userId: generation.userId, currentRevisionNumber: generation.currentRevisionNumber, nextRevisionNumber: generation.nextRevisionNumber }, data: { currentRevisionNumber: generation.nextRevisionNumber, nextRevisionNumber: { increment: 1 }, htmlContent: html } });
      if (updated.count !== 1) return null;
      await tx.slideRevision.create({ data: { slideGenerationId: generation.id, revisionNumber: generation.nextRevisionNumber, parentRevisionNumber: generation.currentRevisionNumber, operation: "UNDO", editRequest: { slideNumber, restoredFromRevision: target.revisionNumber }, changedSlideNumbers: [slideNumber], htmlContent: html } });
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: generation.id }, select });
    });
  }
  async undoableSlideNumbers(generation: StoredPresentation) {
    if (generation.currentRevisionNumber === null || !generation.htmlContent) return [];
    const revisions = await db.slideRevision.findMany({ where: { slideGenerationId: generation.id }, orderBy: { revisionNumber: "desc" } });
    const outline = generation.approvedOutline as { slides?: Array<{ number: number }> } | null;
    return (outline?.slides ?? []).map((slide) => slide.number).filter((number) => previousSlideRevision(revisions, generation.currentRevisionNumber!, number, generation.htmlContent!) !== null);
  }
}

type Revision = { revisionNumber: number; parentRevisionNumber: number | null; operation: string; editRequest: unknown; htmlContent: string };

function previousSlideRevision(revisions: Revision[], currentNumber: number, slideNumber: number, currentHtml: string) {
  const byNumber = new Map(revisions.map((revision) => [revision.revisionNumber, revision]));
  const current = byNumber.get(currentNumber);
  const undoRequest = current?.operation === "UNDO" && isUndoRequest(current.editRequest, slideNumber) ? current.editRequest : null;
  let cursor = undoRequest ? byNumber.get(undoRequest.restoredFromRevision)?.parentRevisionNumber ?? null : current?.parentRevisionNumber ?? null;
  const currentSlide = extractSlides(currentHtml, [slideNumber])[slideNumber];
  while (cursor !== null) {
    const revision = byNumber.get(cursor);
    if (!revision) return null;
    if (revision.operation === "UNDO" && isUndoRequest(revision.editRequest, slideNumber)) {
      cursor = byNumber.get(revision.editRequest.restoredFromRevision)?.parentRevisionNumber ?? null;
      continue;
    }
    const candidate = extractSlides(revision.htmlContent, [slideNumber])[slideNumber];
    if (candidate !== currentSlide) return revision;
    cursor = revision.parentRevisionNumber;
  }
  return null;
}

function isUndoRequest(value: unknown, slideNumber: number): value is { slideNumber: number; restoredFromRevision: number } {
  return typeof value === "object" && value !== null && "slideNumber" in value && "restoredFromRevision" in value && value.slideNumber === slideNumber && typeof value.restoredFromRevision === "number";
}
