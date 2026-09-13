import type { Prisma } from "../../../../generated/prisma/client";
import type { SlideDocument } from "../../domain/structured/types";
import { hashSlide } from "./content-hash";

export type StructuredWriteClient = Pick<Prisma.TransactionClient, "slideSnapshot" | "slideRevision" | "slideRevisionSlide" | "slideGeneration">;

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION;
}

// Insert-or-reuse-by-content-hash, race-safe: two concurrent requests
// persisting identical (html, css) will have one `create` succeed and the
// other hit the unique (slideGenerationId, contentHash) constraint, at which
// point the loser simply reads back the winner's row instead of erroring -
// both callers end up with the same snapshot ID either way.
async function upsertSnapshotByHash(client: StructuredWriteClient, slideGenerationId: string, contentHash: string, slide: SlideDocument): Promise<string> {
  const existing = await client.slideSnapshot.findUnique({
    where: { slideGenerationId_contentHash: { slideGenerationId, contentHash } },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    return (
      await client.slideSnapshot.create({
        data: { slideGenerationId, contentHash, html: slide.html, css: slide.css },
        select: { id: true },
      })
    ).id;
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    return (
      await client.slideSnapshot.findUniqueOrThrow({
        where: { slideGenerationId_contentHash: { slideGenerationId, contentHash } },
        select: { id: true },
      })
    ).id;
  }
}

// Persists (or reuses) a snapshot for every given slide and returns
// slideNumber -> snapshotId for exactly the slides passed in. A slide whose
// (html, css) is byte-identical to one already stored for this generation -
// in this revision or any earlier one - never creates a new row at all.
export async function resolveStructuredSlides(client: StructuredWriteClient, slideGenerationId: string, slides: SlideDocument[]): Promise<Map<number, string>> {
  const snapshotIdBySlideNumber = new Map<number, string>();
  for (const slide of slides) {
    const snapshotId = await upsertSnapshotByHash(client, slideGenerationId, hashSlide(slide), slide);
    snapshotIdBySlideNumber.set(slide.number, snapshotId);
  }
  return snapshotIdBySlideNumber;
}

export interface WriteRevisionInput {
  slideGenerationId: string;
  expectedCurrentRevisionNumber: number | null;
  expectedNextRevisionNumber: number;
  operation: "GENERATE" | "EDIT" | "UNDO";
  editRequest: Prisma.InputJsonValue | undefined;
  changedSlideNumbers: number[];
  slideSnapshotIdByNumber: Map<number, string>;
}

// Atomic compare-and-swap revision write: creates the revision row and its
// full slide composition, then advances the generation's current/next
// revision pointers only if they still match what the caller expected.
// Returns null (no rows written, no orphan revision) on a lost race.
export async function writeStructuredRevision(client: StructuredWriteClient, input: WriteRevisionInput): Promise<string | null> {
  const updated = await client.slideGeneration.updateMany({
    where: {
      id: input.slideGenerationId,
      currentRevisionNumber: input.expectedCurrentRevisionNumber,
      nextRevisionNumber: input.expectedNextRevisionNumber,
    },
    data: {
      currentRevisionNumber: input.expectedNextRevisionNumber,
      nextRevisionNumber: { increment: 1 },
    },
  });
  if (updated.count !== 1) return null;

  const revision = await client.slideRevision.create({
    data: {
      slideGenerationId: input.slideGenerationId,
      revisionNumber: input.expectedNextRevisionNumber,
      parentRevisionNumber: input.expectedCurrentRevisionNumber,
      operation: input.operation,
      editRequest: input.editRequest,
      changedSlideNumbers: input.changedSlideNumbers as Prisma.InputJsonValue,
      htmlContent: null,
      animationRegistryVersion: null,
    },
    select: { id: true },
  });

  await Promise.all(
    Array.from(input.slideSnapshotIdByNumber.entries()).map(([slideNumber, slideSnapshotId]) =>
      client.slideRevisionSlide.create({
        data: { slideRevisionId: revision.id, slideNumber, slideSnapshotId },
      }),
    ),
  );

  return revision.id;
}
