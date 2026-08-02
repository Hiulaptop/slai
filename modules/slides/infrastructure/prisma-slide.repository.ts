import type { Prisma } from "../../../generated/prisma/client";
import { db } from "../../database/infrastructure/client";
import type { SlideRepository, StoredPresentation } from "../application/slide.ports";

const select = {
  id: true, userId: true, status: true, approvedOutline: true, htmlContent: true,
  currentRevisionNumber: true, nextRevisionNumber: true, provider: true, modelId: true,
  finishReason: true, promptTokens: true, completionTokens: true, totalTokens: true,
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
      await tx.slideRevision.create({ data: { slideGenerationId: id, revisionNumber: 1, operation: "GENERATE", htmlContent: html } });
      return tx.slideGeneration.update({ where: { id }, data: { status: "COMPLETED", htmlContent: html, responsePayload: { model: response.model } as Prisma.InputJsonValue, finishReason: response.finishReason, promptTokens: response.usage.promptTokens, completionTokens: response.usage.completionTokens, totalTokens: response.usage.totalTokens, currentRevisionNumber: 1, nextRevisionNumber: 2, completedAt: new Date() }, select });
    });
  }
  findOwned(id: string, userId: string) { return db.slideGeneration.findFirst({ where: { id, userId }, select }); }
  appendEdit(input: Parameters<SlideRepository["appendEdit"]>[0]) {
    return db.$transaction(async (tx) => {
      const updated = await tx.slideGeneration.updateMany({ where: { id: input.generation.id, userId: input.generation.userId, status: "COMPLETED", currentRevisionNumber: input.generation.currentRevisionNumber, nextRevisionNumber: input.generation.nextRevisionNumber }, data: { htmlContent: input.html, currentRevisionNumber: input.generation.nextRevisionNumber, nextRevisionNumber: { increment: 1 } } });
      if (updated.count !== 1) return null;
      await tx.slideRevision.create({ data: { slideGenerationId: input.generation.id, revisionNumber: input.generation.nextRevisionNumber, parentRevisionNumber: input.generation.currentRevisionNumber, operation: "EDIT", editRequest: input.edits as Prisma.InputJsonValue, htmlContent: input.html } });
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: input.generation.id }, select });
    });
  }
  undo(generation: StoredPresentation) {
    return db.$transaction(async (tx) => {
      if (generation.currentRevisionNumber === null) return null;
      const current = await tx.slideRevision.findUnique({ where: { slideGenerationId_revisionNumber: { slideGenerationId: generation.id, revisionNumber: generation.currentRevisionNumber } } });
      if (current?.parentRevisionNumber == null) return null;
      const parent = await tx.slideRevision.findUniqueOrThrow({ where: { slideGenerationId_revisionNumber: { slideGenerationId: generation.id, revisionNumber: current.parentRevisionNumber } } });
      const updated = await tx.slideGeneration.updateMany({ where: { id: generation.id, userId: generation.userId, currentRevisionNumber: generation.currentRevisionNumber }, data: { currentRevisionNumber: parent.revisionNumber, htmlContent: parent.htmlContent } });
      if (updated.count !== 1) return null;
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: generation.id }, select });
    });
  }
}
