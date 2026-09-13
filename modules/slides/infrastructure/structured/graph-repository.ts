import type { Prisma } from "../../../../generated/prisma/client";
import type { StructuredRevision } from "../../domain/structured/types";

// Any Prisma client or interactive-transaction client - this only needs read
// access, so callers can pass either `db` directly or a `tx` from
// `db.$transaction`.
export type StructuredReadClient = Pick<Prisma.TransactionClient, "slideRevisionSlide" | "slideSnapshot">;

export class MalformedStoredGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedStoredGraphError";
  }
}

export async function loadStructuredRevision(client: StructuredReadClient, slideRevisionId: string): Promise<StructuredRevision | null> {
  const revisionSlides = await client.slideRevisionSlide.findMany({
    where: { slideRevisionId },
    orderBy: { slideNumber: "asc" },
  });
  if (!revisionSlides.length) return null;

  const snapshots = await client.slideSnapshot.findMany({ where: { id: { in: revisionSlides.map((row) => row.slideSnapshotId) } } });
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

  const slides = revisionSlides.map((revisionSlide) => {
    const snapshot = snapshotsById.get(revisionSlide.slideSnapshotId);
    if (!snapshot) throw new MalformedStoredGraphError(`Revision references missing slide snapshot: ${revisionSlide.slideSnapshotId}`);
    return { number: revisionSlide.slideNumber, html: snapshot.html, css: snapshot.css };
  });

  return { slides };
}
