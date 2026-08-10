// Integration tests against a real database, deliberately not mocked.
//
// Everywhere else in this codebase, repository tests mock Prisma entirely
// (see prisma-slide.repository.test.ts) because the logic under test is
// "did we call the right Prisma method with the right where/data shape."
// The content-addressing and copy-on-write logic here is different: its
// entire point is behavior that only a real database can prove - that
// identical content actually dedupes to one row, that a compare-and-swap
// actually loses a race, that cascade delete actually removes everything.
// Mocking would only prove "this function calls create() when I told the
// mock to return no existing row," which begs the question.
//
// Skips (not fails) when no database is reachable, so `pnpm test` stays
// green in environments without MySQL configured - see the `beforeAll` guard.

import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "../../../database/infrastructure/client";
import type { ElementChildCommand, ElementNodeCommand, SlideCommand } from "../../domain/structured/types";
import { hashElementGraph, hashSlide } from "./content-hash";
import { loadStructuredRevision } from "./graph-repository";
import { resolveStructuredSlides, writeStructuredRevision } from "./write";

let databaseAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    databaseAvailable = false;
  }
});

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

function textNode(id: string, text: string): ElementNodeCommand {
  return {
    id,
    type: "text",
    schemaVersion: 1,
    geometry: { x: 0, y: 0, width: 200, height: 40, zIndex: 0 },
    props: { text, styleType: "body", fontSize: 18, fontWeight: 400, color: "#000", backgroundColor: null, align: "left", bold: false, italic: false, underline: false, list: "none" },
    animation: null,
  };
}

function slide(number: number, elementIds: string[]): SlideCommand {
  return { number, width: 960, height: 540, props: {}, topLevelElementIds: elementIds };
}

// Each test below early-returns if the database isn't reachable (checked in
// beforeAll, which resolves before any test body runs) - a plain
// `describe.runIf` can't be used here since its condition is evaluated
// synchronously at collection time, before beforeAll has had a chance to run.
describe("structured persistence repository (integration)", () => {
  it("dedupes byte-identical content within one generation", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes = [textNode("a", "Hello"), textNode("b", "Hello")];
    const slides = [slide(1, ["a"]), slide(2, ["b"])];

    const result = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], slides));

    const snapshotIds = new Set(result.values());
    expect(snapshotIds.size).toBe(1); // identical slide content -> one snapshot row, reused
    const nodeRows = await db.slideElementNode.findMany({ where: { slideGenerationId: generationId } });
    expect(nodeRows).toHaveLength(1); // identical element content -> one node row, reused
  });

  it("resolving the same content twice does not duplicate rows (idempotent across calls)", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes = [textNode("a", "Once")];
    const slides = [slide(1, ["a"])];

    await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], slides));
    await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], slides));

    const nodeRows = await db.slideElementNode.findMany({ where: { slideGenerationId: generationId } });
    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(nodeRows).toHaveLength(1);
    expect(snapshotRows).toHaveLength(1);
  });

  it("persists and reassembles nested content (table -> cell -> text)", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes: ElementNodeCommand[] = [
      {
        id: "table",
        type: "table",
        schemaVersion: 1,
        geometry: { x: 0, y: 0, width: 400, height: 200, zIndex: 0 },
        props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 },
        animation: null,
      },
      {
        id: "cell",
        type: "table-cell",
        schemaVersion: 1,
        geometry: { x: null, y: null, width: null, height: null, zIndex: null },
        props: { row: 0, column: 0, rowSpan: 1, columnSpan: 1, padding: 8, backgroundColor: null },
        animation: null,
      },
      textNode("text", "In a cell"),
    ];
    const children: ElementChildCommand[] = [
      { parentId: "table", childId: "cell", slotKey: "r0c0", orderIndex: 0 },
      { parentId: "cell", childId: "text", slotKey: "content", orderIndex: 0 },
    ];
    const slides = [slide(1, ["table"])];

    const snapshotIdByNumber = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, children, slides));
    const revisionId = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        animationRegistryVersion: 1,
        slideSnapshotIdByNumber: snapshotIdByNumber,
      }),
    );
    expect(revisionId).not.toBeNull();

    const revision = await loadStructuredRevision(db, generationId, revisionId!, 1);
    expect(revision?.slides).toHaveLength(1);
    const table = revision!.slides[0].elements[0];
    expect(table.type).toBe("table");
    expect(table.children[0].element.type).toBe("table-cell");
    expect(table.children[0].element.children[0].element.type).toBe("text");
    expect((table.children[0].element.children[0].element.props as { text: string }).text).toBe("In a cell");
  });

  it("reuses unchanged slides and only creates a new snapshot for the changed one", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes = [textNode("a", "Slide one"), textNode("b", "Slide two")];
    const slides = [slide(1, ["a"]), slide(2, ["b"])];
    const firstSnapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], slides));
    const firstRevisionId = await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1, 2],
        animationRegistryVersion: 1,
        slideSnapshotIdByNumber: firstSnapshots,
      }),
    );
    expect(firstRevisionId).not.toBeNull();

    // Only slide 2 changes; slide 1's snapshot ID carries over unchanged -
    // the copy-on-write claim this whole subsystem exists to satisfy.
    const changedNodes = [textNode("b2", "Slide two, edited")];
    const changedSnapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, changedNodes, [], [slide(2, ["b2"])]));
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
        animationRegistryVersion: 1,
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
    const firstRevisionAgain = await loadStructuredRevision(db, generationId, firstRevisionId!, 1);
    expect((firstRevisionAgain!.slides[1].elements[0].props as { text: string }).text).toBe("Slide two");
  });

  it("loses a stale compare-and-swap and leaves no orphan revision", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes = [textNode("a", "v1")];
    const snapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], [slide(1, ["a"])]));
    await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        animationRegistryVersion: 1,
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
        animationRegistryVersion: 1,
        slideSnapshotIdByNumber: snapshots,
      }),
    );
    expect(staleResult).toBeNull();

    const revisionCount = await db.slideRevision.count({ where: { slideGenerationId: generationId } });
    expect(revisionCount).toBe(1); // the lost race created no orphan revision row

    const generation = await db.slideGeneration.findUniqueOrThrow({ where: { id: generationId } });
    expect(generation.currentRevisionNumber).toBe(1); // unchanged by the lost race
  });

  it("cascade-deletes every structured row when the generation is deleted", async () => {
    if (!databaseAvailable) return;
    const generationId = await createGeneration();
    const nodes = [textNode("a", "to be deleted")];
    const snapshots = await db.$transaction((tx) => resolveStructuredSlides(tx, generationId, nodes, [], [slide(1, ["a"])]));
    await db.$transaction((tx) =>
      writeStructuredRevision(tx, {
        slideGenerationId: generationId,
        expectedCurrentRevisionNumber: 0,
        expectedNextRevisionNumber: 1,
        operation: "GENERATE",
        editRequest: undefined,
        changedSlideNumbers: [1],
        animationRegistryVersion: 1,
        slideSnapshotIdByNumber: snapshots,
      }),
    );

    await db.slideGeneration.delete({ where: { id: generationId } });
    createdGenerationIds.splice(createdGenerationIds.indexOf(generationId), 1); // already deleted, don't double-delete in afterEach

    expect(await db.slideElementNode.count({ where: { slideGenerationId: generationId } })).toBe(0);
    expect(await db.slideSnapshot.count({ where: { slideGenerationId: generationId } })).toBe(0);
    expect(await db.slideRevision.count({ where: { slideGenerationId: generationId } })).toBe(0);
  });
});

describe("content hashing (pure, no database)", () => {
  it("hashes identical content the same regardless of node ID or object key order", () => {
    const a = hashElementGraph([textNode("x", "same")], []);
    const b = hashElementGraph([textNode("y", "same")], []);
    expect(a.get("x")!.hash).toBe(b.get("y")!.hash);
  });

  it("hashes different content differently", () => {
    const a = hashElementGraph([textNode("x", "one")], []);
    const b = hashElementGraph([textNode("x", "two")], []);
    expect(a.get("x")!.hash).not.toBe(b.get("x")!.hash);
  });

  it("folds child hashes into the parent hash so a nested change propagates up", () => {
    const table: ElementNodeCommand = {
      id: "t",
      type: "table",
      schemaVersion: 1,
      geometry: { x: null, y: null, width: null, height: null, zIndex: null },
      props: { rows: 1, columns: 1, borderColor: "#000", borderWidth: 1 },
      animation: null,
    };
    const children = (childId: string): ElementChildCommand[] => [{ parentId: "t", childId, slotKey: "r0c0", orderIndex: 0 }];

    const a = hashElementGraph([table, textNode("c1", "A")], children("c1"));
    const b = hashElementGraph([table, textNode("c1", "B")], children("c1"));
    expect(a.get("t")!.hash).not.toBe(b.get("t")!.hash);
  });

  it("hashes a slide from its top-level element hashes and structural props", () => {
    const s1 = hashSlide(slide(1, ["a"]), ["hash-a"]);
    const s2 = hashSlide(slide(1, ["a"]), ["hash-a"]);
    const s3 = hashSlide(slide(1, ["a"]), ["hash-b"]);
    expect(s1).toBe(s2);
    expect(s1).not.toBe(s3);
  });
});
