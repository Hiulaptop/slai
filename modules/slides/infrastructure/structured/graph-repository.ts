import type { Prisma } from "../../../../generated/prisma/client";
import type { ElementChild, ElementNode, Geometry, SlideDocument, StructuredRevision } from "../../domain/structured/types";

// Any Prisma client or interactive-transaction client - every function here
// only needs read access to the structured tables, so callers can pass
// either `db` directly or a `tx` from `db.$transaction`.
export type StructuredReadClient = Pick<
  Prisma.TransactionClient,
  "slideRevisionSlide" | "slideSnapshot" | "slideSnapshotElement" | "slideElementNode" | "slideElementChild"
>;

interface DbNodeRow {
  id: string;
  type: string;
  schemaVersion: number;
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  zIndex: number | null;
  props: unknown;
  animationKey: string | null;
  animationProps: unknown;
}

interface DbEdgeRow {
  parentElementNodeId: string;
  childElementNodeId: string;
  slotKey: string;
  orderIndex: number;
}

export class MalformedStoredGraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedStoredGraphError";
  }
}

// Loads every element node/edge belonging to one generation in two bounded
// queries (not one query per node), then assembly below walks them in
// memory. Content-addressed sharing keeps a generation's total node count
// bounded by how much genuinely distinct content it has ever contained, not
// by revision count, so this stays small for real decks - see
// design.md's "Persistent DAG reads require more joins than a single
// LongText read" risk entry.
async function loadGenerationGraph(
  client: StructuredReadClient,
  slideGenerationId: string,
): Promise<{ nodesById: Map<string, DbNodeRow>; childrenByParent: Map<string, DbEdgeRow[]> }> {
  const [nodes, edges] = await Promise.all([
    client.slideElementNode.findMany({ where: { slideGenerationId } }),
    client.slideElementChild.findMany({ where: { parent: { slideGenerationId } } }),
  ]);
  const nodesById = new Map(nodes.map((node) => [node.id, node as DbNodeRow]));
  const childrenByParent = new Map<string, DbEdgeRow[]>();
  for (const edge of edges) {
    const siblings = childrenByParent.get(edge.parentElementNodeId) ?? [];
    siblings.push(edge);
    childrenByParent.set(edge.parentElementNodeId, siblings);
  }
  return { nodesById, childrenByParent };
}

function assembleNode(
  nodeId: string,
  nodesById: Map<string, DbNodeRow>,
  childrenByParent: Map<string, DbEdgeRow[]>,
): ElementNode {
  const row = nodesById.get(nodeId);
  if (!row) throw new MalformedStoredGraphError(`Stored graph references missing element node: ${nodeId}`);
  const geometry: Geometry = { x: row.x, y: row.y, width: row.width, height: row.height, zIndex: row.zIndex };
  const edges = (childrenByParent.get(nodeId) ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
  const children: ElementChild[] = edges.map((edge) => ({
    slotKey: edge.slotKey,
    orderIndex: edge.orderIndex,
    element: assembleNode(edge.childElementNodeId, nodesById, childrenByParent),
  }));
  return {
    id: row.id,
    type: row.type,
    schemaVersion: row.schemaVersion,
    geometry,
    props: row.props,
    animation: row.animationKey ? { key: row.animationKey, props: (row.animationProps as Record<string, unknown>) ?? {} } : null,
    children,
  };
}

export async function loadStructuredRevision(
  client: StructuredReadClient,
  slideGenerationId: string,
  slideRevisionId: string,
  animationRegistryVersion: number | null,
): Promise<StructuredRevision | null> {
  const revisionSlides = await client.slideRevisionSlide.findMany({
    where: { slideRevisionId },
    orderBy: { slideNumber: "asc" },
  });
  if (!revisionSlides.length) return null;

  const snapshotIds = revisionSlides.map((row) => row.slideSnapshotId);
  const [snapshots, snapshotElements, graph] = await Promise.all([
    client.slideSnapshot.findMany({ where: { id: { in: snapshotIds } } }),
    client.slideSnapshotElement.findMany({ where: { slideSnapshotId: { in: snapshotIds } }, orderBy: { orderIndex: "asc" } }),
    loadGenerationGraph(client, slideGenerationId),
  ]);

  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const elementsBySnapshot = new Map<string, string[]>();
  for (const row of snapshotElements) {
    const list = elementsBySnapshot.get(row.slideSnapshotId) ?? [];
    list.push(row.elementNodeId);
    elementsBySnapshot.set(row.slideSnapshotId, list);
  }

  const slides: SlideDocument[] = revisionSlides.map((revisionSlide) => {
    const snapshot = snapshotsById.get(revisionSlide.slideSnapshotId);
    if (!snapshot) throw new MalformedStoredGraphError(`Revision references missing slide snapshot: ${revisionSlide.slideSnapshotId}`);
    const elementIds = elementsBySnapshot.get(snapshot.id) ?? [];
    return {
      number: revisionSlide.slideNumber,
      width: snapshot.width,
      height: snapshot.height,
      props: (snapshot.props as Record<string, unknown>) ?? {},
      elements: elementIds.map((id) => assembleNode(id, graph.nodesById, graph.childrenByParent)),
    };
  });

  return { animationRegistryVersion: animationRegistryVersion ?? 1, slides };
}
