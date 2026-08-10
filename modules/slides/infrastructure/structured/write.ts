import type { Prisma } from "../../../../generated/prisma/client";
import type { ElementChildCommand, ElementNodeCommand, SlideCommand } from "../../domain/structured/types";
import { hashElementGraph, hashSlide } from "./content-hash";

export type StructuredWriteClient = Pick<
  Prisma.TransactionClient,
  "slideElementNode" | "slideElementChild" | "slideSnapshot" | "slideSnapshotElement" | "slideRevision" | "slideRevisionSlide" | "slideGeneration"
>;

const UNIQUE_CONSTRAINT_VIOLATION = "P2002";

function isUniqueConstraintViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === UNIQUE_CONSTRAINT_VIOLATION;
}

// Insert-or-reuse-by-content-hash, race-safe: two concurrent requests
// persisting identical content will have one `create` succeed and the other
// hit the unique (slideGenerationId, contentHash) constraint, at which point
// the loser simply reads back the winner's row instead of erroring - both
// callers end up with the same node ID either way.
async function upsertNodeByHash(
  client: StructuredWriteClient,
  slideGenerationId: string,
  contentHash: string,
  node: ElementNodeCommand,
): Promise<string> {
  const existing = await client.slideElementNode.findUnique({
    where: { slideGenerationId_contentHash: { slideGenerationId, contentHash } },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await client.slideElementNode.create({
      data: {
        slideGenerationId,
        contentHash,
        type: node.type,
        schemaVersion: node.schemaVersion,
        x: node.geometry.x,
        y: node.geometry.y,
        width: node.geometry.width,
        height: node.geometry.height,
        zIndex: node.geometry.zIndex,
        props: node.props as Prisma.InputJsonValue,
        animationKey: node.animation?.key ?? null,
        animationProps: (node.animation?.props as Prisma.InputJsonValue | undefined) ?? undefined,
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    if (!isUniqueConstraintViolation(error)) throw error;
    const winner = await client.slideElementNode.findUniqueOrThrow({
      where: { slideGenerationId_contentHash: { slideGenerationId, contentHash } },
      select: { id: true },
    });
    return winner.id;
  }
}

async function upsertSnapshotByHash(
  client: StructuredWriteClient,
  slideGenerationId: string,
  contentHash: string,
  slide: SlideCommand,
): Promise<string> {
  const existing = await client.slideSnapshot.findUnique({
    where: { slideGenerationId_contentHash: { slideGenerationId, contentHash } },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    return (
      await client.slideSnapshot.create({
        data: { slideGenerationId, contentHash, width: slide.width, height: slide.height, props: slide.props as Prisma.InputJsonValue },
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

// Persists (or reuses) every node and edge needed for the given slides, then
// the slide snapshots themselves, and returns slideNumber -> snapshotId for
// exactly the slides passed in. Nodes are written leaves-first (the hash map
// iterates in that order - see content-hash.ts) so `SlideElementChild`
// foreign keys always resolve. Content-addressing means a slide whose
// content is byte-identical to one already stored for this generation - in
// this revision or any earlier one - never creates new rows at all.
export async function resolveStructuredSlides(
  client: StructuredWriteClient,
  slideGenerationId: string,
  nodes: ElementNodeCommand[],
  children: ElementChildCommand[],
  slides: SlideCommand[],
): Promise<Map<number, string>> {
  // hashes.values() iterates leaves-first (see hashElementGraph's post-order
  // resolution), so every node's children are already persisted - and thus
  // present in persistedNodeId - by the time the node itself is processed.
  const hashes = hashElementGraph(nodes, children);
  const persistedNodeId = new Map<string, string>();

  for (const entry of hashes.values()) {
    const id = await upsertNodeByHash(client, slideGenerationId, entry.hash, entry.node);
    persistedNodeId.set(entry.nodeId, id);
    const parentId = id;
    for (const child of entry.children) {
      const childPersistedId = persistedNodeId.get(child.childId)!;
      await client.slideElementChild.upsert({
        where: { parentElementNodeId_slotKey: { parentElementNodeId: parentId, slotKey: child.slotKey } },
        create: { parentElementNodeId: parentId, childElementNodeId: childPersistedId, slotKey: child.slotKey, orderIndex: child.orderIndex },
        update: {},
      });
    }
  }

  const snapshotIdBySlideNumber = new Map<number, string>();
  for (const slide of slides) {
    const topLevelHashes = slide.topLevelElementIds.map((id) => hashes.get(id)!.hash);
    const slideHash = hashSlide(slide, topLevelHashes);
    const snapshotId = await upsertSnapshotByHash(client, slideGenerationId, slideHash, slide);
    // upsert is idempotent, so a reused snapshot (found by hash, its
    // elements already linked when first created) just no-ops here.
    await Promise.all(
      slide.topLevelElementIds.map((id, orderIndex) =>
        client.slideSnapshotElement.upsert({
          where: { slideSnapshotId_orderIndex: { slideSnapshotId: snapshotId, orderIndex } },
          create: { slideSnapshotId: snapshotId, orderIndex, elementNodeId: persistedNodeId.get(id)! },
          update: {},
        }),
      ),
    );
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
  animationRegistryVersion: number;
  slideSnapshotIdByNumber: Map<number, string>;
}

// Atomic compare-and-swap revision write: creates the revision row and its
// full slide composition, then advances the generation's current/next
// revision pointers only if they still match what the caller expected.
// Returns null (no rows written, no orphan revision) on a lost race,
// matching the exact CAS shape `appendEdit`/`saveDesign` already use for
// the legacy HTML path.
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
      animationRegistryVersion: input.animationRegistryVersion,
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
