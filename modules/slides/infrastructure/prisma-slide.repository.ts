import type { Prisma } from "../../../generated/prisma/client";
import { db } from "../../database/infrastructure/client";
import type { SlideRepository, StoredPresentation } from "../application/slide.ports";
import { extractSlides, replaceSlides, slideNumbers } from "../domain/html";
import { CURRENT_ANIMATION_REGISTRY_VERSION } from "../domain/structured/animation-registry";
import type { FlattenedDocument } from "../domain/structured/compose";
import type { StructuredRevision } from "../domain/structured/types";
import { loadStructuredRevision } from "./structured/graph-repository";
import { resolveStructuredSlides, writeStructuredRevision } from "./structured/write";

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
      if (!target || target.htmlContent === null) return null;
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

  // --- Structured revision operations (add-structured-slide-persistence) ---
  // These are the source of truth for every new presentation; the HTML
  // methods above remain only for generations created before this change
  // (see design.md's non-destructive migration plan - Section 7 backfills
  // them, this repository does not attempt to bridge the two formats).

  async loadCurrentStructuredRevision(generation: StoredPresentation): Promise<StructuredRevision | null> {
    if (generation.currentRevisionNumber === null) return null;
    const revision = await db.slideRevision.findUnique({
      where: { slideGenerationId_revisionNumber: { slideGenerationId: generation.id, revisionNumber: generation.currentRevisionNumber } },
      select: { id: true, animationRegistryVersion: true },
    });
    if (!revision) return null;
    return loadStructuredRevision(db, generation.id, revision.id, revision.animationRegistryVersion);
  }

  completeStructuredGeneration(id: string, document: FlattenedDocument, animationRegistryVersion: number, response: Parameters<SlideRepository["completeGeneration"]>[2]) {
    return db.$transaction(async (tx) => {
      const slideSnapshotIdByNumber = await resolveStructuredSlides(tx, id, document.nodes, document.children, document.slides);
      const revisionId = await writeStructuredRevision(tx, {
        slideGenerationId: id,
        expectedCurrentRevisionNumber: null,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: document.slides.map((slide) => slide.number),
        animationRegistryVersion,
        slideSnapshotIdByNumber,
      });
      if (!revisionId) throw new Error("Unexpected compare-and-swap conflict completing a brand-new generation");
      return tx.slideGeneration.update({
        where: { id },
        data: {
          status: "COMPLETED",
          responsePayload: { model: response.model } as Prisma.InputJsonValue,
          finishReason: response.finishReason,
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
          completedAt: new Date(),
        },
        select,
      });
    });
  }

  saveStructuredDesign(input: { generation: StoredPresentation; document: FlattenedDocument; animationRegistryVersion: number; expectedRevision: number | null }) {
    return db.$transaction(async (tx) => {
      const slideSnapshotIdByNumber = await resolveStructuredSlides(tx, input.generation.id, input.document.nodes, input.document.children, input.document.slides);
      const revisionId = await writeStructuredRevision(tx, {
        slideGenerationId: input.generation.id,
        expectedCurrentRevisionNumber: input.expectedRevision,
        expectedNextRevisionNumber: input.generation.nextRevisionNumber,
        operation: "EDIT",
        editRequest: undefined,
        changedSlideNumbers: input.document.slides.map((slide) => slide.number),
        animationRegistryVersion: input.animationRegistryVersion,
        slideSnapshotIdByNumber,
      });
      if (!revisionId) return null;
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: input.generation.id }, select });
    });
  }

  appendStructuredEdit(input: { generation: StoredPresentation; replacements: FlattenedDocument; animationRegistryVersion: number; editRequest: unknown }) {
    return db.$transaction(async (tx) => {
      if (input.generation.currentRevisionNumber === null) return null;
      const currentRevision = await tx.slideRevision.findUnique({
        where: { slideGenerationId_revisionNumber: { slideGenerationId: input.generation.id, revisionNumber: input.generation.currentRevisionNumber } },
        select: { id: true },
      });
      if (!currentRevision) return null;
      const currentComposition = await tx.slideRevisionSlide.findMany({ where: { slideRevisionId: currentRevision.id } });
      const slideSnapshotIdByNumber = new Map(currentComposition.map((row) => [row.slideNumber, row.slideSnapshotId]));

      const changedSnapshotIds = await resolveStructuredSlides(tx, input.generation.id, input.replacements.nodes, input.replacements.children, input.replacements.slides);
      changedSnapshotIds.forEach((snapshotId, slideNumber) => slideSnapshotIdByNumber.set(slideNumber, snapshotId));

      const revisionId = await writeStructuredRevision(tx, {
        slideGenerationId: input.generation.id,
        expectedCurrentRevisionNumber: input.generation.currentRevisionNumber,
        expectedNextRevisionNumber: input.generation.nextRevisionNumber,
        operation: "EDIT",
        editRequest: input.editRequest as Prisma.InputJsonValue,
        changedSlideNumbers: input.replacements.slides.map((slide) => slide.number),
        animationRegistryVersion: input.animationRegistryVersion,
        slideSnapshotIdByNumber,
      });
      if (!revisionId) return null;
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: input.generation.id }, select });
    });
  }

  undoStructured(generation: StoredPresentation, slideNumber: number) {
    return db.$transaction(async (tx) => {
      if (generation.currentRevisionNumber === null) return null;
      const currentRevision = await tx.slideRevision.findUnique({
        where: { slideGenerationId_revisionNumber: { slideGenerationId: generation.id, revisionNumber: generation.currentRevisionNumber } },
        select: { id: true, animationRegistryVersion: true },
      });
      if (!currentRevision) return null;

      const annotated = await loadAnnotatedStructuredRevisions(tx, generation.id);
      const target = findPreviousDifferingSnapshot(annotated, generation.currentRevisionNumber, slideNumber);
      if (!target) return null;

      const currentComposition = await tx.slideRevisionSlide.findMany({ where: { slideRevisionId: currentRevision.id } });
      const slideSnapshotIdByNumber = new Map(currentComposition.map((row) => [row.slideNumber, row.slideSnapshotId]));
      slideSnapshotIdByNumber.set(slideNumber, target.slideSnapshotId);

      const revisionId = await writeStructuredRevision(tx, {
        slideGenerationId: generation.id,
        expectedCurrentRevisionNumber: generation.currentRevisionNumber,
        expectedNextRevisionNumber: generation.nextRevisionNumber,
        operation: "UNDO",
        editRequest: { slideNumber, restoredFromRevision: target.revisionNumber } as Prisma.InputJsonValue,
        changedSlideNumbers: [slideNumber],
        animationRegistryVersion: currentRevision.animationRegistryVersion ?? CURRENT_ANIMATION_REGISTRY_VERSION,
        slideSnapshotIdByNumber,
      });
      if (!revisionId) return null;
      return tx.slideGeneration.findUniqueOrThrow({ where: { id: generation.id }, select });
    });
  }

  async undoableStructuredSlideNumbers(generation: StoredPresentation): Promise<number[]> {
    if (generation.currentRevisionNumber === null) return [];
    const annotated = await loadAnnotatedStructuredRevisions(db, generation.id);
    const outline = generation.approvedOutline as { slides?: Array<{ number: number }> } | null;
    return (outline?.slides ?? [])
      .map((slide) => slide.number)
      .filter((number) => findPreviousDifferingSnapshot(annotated, generation.currentRevisionNumber!, number) !== null);
  }
}

type Revision = { revisionNumber: number; parentRevisionNumber: number | null; operation: string; editRequest: unknown; htmlContent: string | null };

// Legacy HTML-based undo history walk. A revision with null htmlContent is
// a structured-only revision (see the structured persistence models in
// prisma/schema.prisma) and has no HTML to diff against here, so it's
// skipped rather than crashing - this path only still runs for generations
// that haven't been converted to structured revisions.
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
    if (revision.htmlContent === null) {
      cursor = revision.parentRevisionNumber;
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

type StructuredReadTxClient = Pick<Prisma.TransactionClient, "slideRevision">;

interface AnnotatedStructuredRevision {
  revisionNumber: number;
  parentRevisionNumber: number | null;
  operation: string;
  editRequest: unknown;
  slideSnapshotIdByNumber: Map<number, string>;
}

async function loadAnnotatedStructuredRevisions(client: StructuredReadTxClient, slideGenerationId: string): Promise<AnnotatedStructuredRevision[]> {
  const revisions = await client.slideRevision.findMany({
    where: { slideGenerationId },
    orderBy: { revisionNumber: "desc" },
    include: { slides: { select: { slideNumber: true, slideSnapshotId: true } } },
  });
  return revisions.map((revision) => ({
    revisionNumber: revision.revisionNumber,
    parentRevisionNumber: revision.parentRevisionNumber,
    operation: revision.operation,
    editRequest: revision.editRequest,
    slideSnapshotIdByNumber: new Map(revision.slides.map((slide) => [slide.slideNumber, slide.slideSnapshotId])),
  }));
}

// Structured counterpart of previousSlideRevision above: content-addressing
// means identical slide content always produces the identical snapshot ID,
// so "did this slide change" is a direct ID comparison instead of an HTML
// diff - see content-hash.ts.
function findPreviousDifferingSnapshot(
  revisions: AnnotatedStructuredRevision[],
  currentRevisionNumber: number,
  slideNumber: number,
): { revisionNumber: number; slideSnapshotId: string } | null {
  const byNumber = new Map(revisions.map((revision) => [revision.revisionNumber, revision]));
  const current = byNumber.get(currentRevisionNumber);
  if (!current) return null;
  const currentSnapshotId = current.slideSnapshotIdByNumber.get(slideNumber) ?? null;
  const undoRequest = current.operation === "UNDO" && isUndoRequest(current.editRequest, slideNumber) ? current.editRequest : null;
  let cursor = undoRequest ? (byNumber.get(undoRequest.restoredFromRevision)?.parentRevisionNumber ?? null) : current.parentRevisionNumber;
  while (cursor !== null) {
    const revision = byNumber.get(cursor);
    if (!revision) return null;
    if (revision.operation === "UNDO" && isUndoRequest(revision.editRequest, slideNumber)) {
      cursor = byNumber.get(revision.editRequest.restoredFromRevision)?.parentRevisionNumber ?? null;
      continue;
    }
    const snapshotId = revision.slideSnapshotIdByNumber.get(slideNumber);
    if (snapshotId && snapshotId !== currentSnapshotId) return { revisionNumber: revision.revisionNumber, slideSnapshotId: snapshotId };
    cursor = revision.parentRevisionNumber;
  }
  return null;
}
