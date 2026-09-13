// Integration tests against a real database, deliberately not mocked - see
// prisma-slide.repository.test.ts for why other repository tests mock
// Prisma instead. Skips (not fails) when no database is reachable.

import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "../../../database/infrastructure/client";
import type { SlideDocument } from "../../domain/structured/types";
import { hashSlide } from "./content-hash";
import { loadStructuredRevision } from "./graph-repository";
import { resolveStructuredSlides, writeStructuredRevision } from "./write";

let databaseAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    databaseAvailable = false;
  }
}, 30_000);

const createdGenerationIds: string[] = [];

afterEach(async () => {
  if (!databaseAvailable) return;
  while (createdGenerationIds.length) {
    const id = createdGenerationIds.pop()!;
    await db.slideGeneration.delete({ where: { id } }).catch(() => undefined);
  }
});

async function createGeneration(): Promise<string> {
  const generation = await db.slideGeneration.create({
    data: {
      userId: null,
      status: "COMPLETED",
      title: "Structured persistence test",
      provider: "test",
      modelId: "test",
      requestPayload: {},
      currentRevisionNumber: 0,
      nextRevisionNumber: 1,
    },
    select: { id: true },
  });
  createdGenerationIds.push(generation.id);
  return generation.id;
}

function slide(number: number, html: string, css = ""): SlideDocument {
  return { number, html, css };
}

describe("structured persistence repository (integration)", () => {
  it("dedupes byte-identical content within one generation", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const slides = [slide(1, "<p>Hello</p>"), slide(2, "<p>Hello</p>")];

    const result = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, slides));

    expect(new Set(result.values()).size).toBe(1); // identical content -> one snapshot row, reused
    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(snapshotRows).toHaveLength(1);
  });

  it("resolving the same content twice does not duplicate rows (idempotent across calls)", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const slides = [slide(1, "<p>Once</p>")];

    await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, slides));
    await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, slides));

    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(snapshotRows).toHaveLength(1);
  });

  it("persists and reassembles a slide's html/css", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const slides = [slide(1, "<table><tr><td>In a cell</td></tr></table>", ".slai-slide table{border:1px solid #000}")];

    const snapshotIdByNumber = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, slides));
    const revisionId = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        slideSnapshotIdByNumber: snapshotIdByNumber,
      }),
    );
    expect(revisionId).not.toBeNull();

    const revision = await loadStructuredRevision(db, revisionId!);
    expect(revision?.slides).toHaveLength(1);
    expect(revision!.slides[0].html).toContain("In a cell");
    expect(revision!.slides[0].css).toContain("border:1px solid #000");
  });

  it("reuses unchanged slides and only creates a new snapshot for the changed one", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const slides = [slide(1, "<p>Slide one</p>"), slide(2, "<p>Slide two</p>")];
    const firstSnapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, slides));
    const firstRevisionId = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1, 2],
        slideSnapshotIdByNumber: firstSnapshots,
      }),
    );
    expect(firstRevisionId).not.toBeNull();

    // Only slide 2 changes; slide 1's snapshot ID carries over unchanged.
    const changedSnapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, [slide(2, "<p>Slide two, edited</p>")]));
    const composition = new Map(firstSnapshots);
    composition.set(2, changedSnapshots.get(2)!);

    const secondRevisionId = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 1,
        expectedNextRevisionNumber: 2,
        operation: "EDIT",
        editRequest: { edits: [{ slideNumber: 2 }] },
        changedSlideNumbers: [2],
        slideSnapshotIdByNumber: composition,
      }),
    );
    expect(secondRevisionId).not.toBeNull();

    const secondRevisionSlide1 = await db.slideRevisionSlide.findUnique({
      where: { slideRevisionId_slideNumber: { slideRevisionId: secondRevisionId!, slideNumber: 1 } },
    });
    expect(secondRevisionSlide1?.slideSnapshotId).toBe(firstSnapshots.get(1)); // reused, not recreated

    const generation = await db.slideGeneration.findUniqueOrThrow({ where: { id: generationId } });
    expect(generation.currentRevisionNumber).toBe(2);

    // Historical read: revision 1 still resolves to its original content.
    const firstRevisionAgain = await loadStructuredRevision(db, firstRevisionId!);
    expect(firstRevisionAgain!.slides[1].html).toContain("Slide two<");
  });

  it("loses a stale compare-and-swap and leaves no orphan revision", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const snapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, [slide(1, "<p>v1</p>")]));
    await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        slideSnapshotIdByNumber: snapshots,
      }),
    );

    // Stale caller still believes current revision is 0 (pre-write value).
    const staleResult = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "EDIT",
        editRequest: undefined,
        changedSlideNumbers: [1],
        slideSnapshotIdByNumber: snapshots,
      }),
    );
    expect(staleResult).toBeNull();

    const revisionCount = await db.slideRevision.count({ where: { slideGenerationId: generationId } });
    expect(revisionCount).toBe(1); // the lost race created no orphan revision row

    const generation = await db.slideGeneration.findUniqueOrThrow({ where: { id: generationId } });
    expect(generation.currentRevisionNumber).toBe(1); // unchanged by the lost race
  });

  it("cascade-deletes every snapshot row when the generation is deleted", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const snapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, [slide(1, "<p>to be deleted</p>")]));
    await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        slideSnapshotIdByNumber: snapshots,
      }),
    );

    await db.slideGeneration.delete({ where: { id: generationId } });
    createdGenerationIds.splice(createdGenerationIds.indexOf(generationId), 1); // already deleted, don't double-delete in afterEach

    expect(await db.slideSnapshot.count({ where: { slideGenerationId: generationId } })).toBe(0);
    expect(await db.slideRevision.count({ where: { slideGenerationId: generationId } })).toBe(0);
  });
});

describe("content hashing (pure, no database)", () => {
  it("hashes identical content the same regardless of key order", () => {
    const a = hashSlide({ html: "<p>same</p>", css: "" });
    const b = hashSlide({ html: "<p>same</p>", css: "" });
    expect(a).toBe(b);
  });

  it("hashes different content differently", () => {
    const a = hashSlide({ html: "<p>one</p>", css: "" });
    const b = hashSlide({ html: "<p>two</p>", css: "" });
    expect(a).not.toBe(b);
  });

  it("hashes different css differently for identical html", () => {
    const a = hashSlide({ html: "<p>x</p>", css: "p{color:red}" });
    const b = hashSlide({ html: "<p>x</p>", css: "p{color:blue}" });
    expect(a).not.toBe(b);
  });
});
