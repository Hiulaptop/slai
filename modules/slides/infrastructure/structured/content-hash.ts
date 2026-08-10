import { createHash } from "node:crypto";

import type { ElementChildCommand, ElementNodeCommand, Geometry, SlideCommand } from "../../domain/structured/types";

// Deterministic content hashing is what makes structural sharing automatic
// (see prisma/schema.prisma's comment on the structured-persistence models):
// identical content always hashes identically regardless of submitted key
// order or node ID, so the repository can look up "does this already exist
// for this generation?" before inserting. Hashing is a Merkle tree - a
// node's hash folds in its children's hashes (by slot/order, not by their
// arbitrary submitted IDs), so an unchanged subtree hashes the same even
// when surrounding content changes.

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export interface ResolvedNodeHash {
  nodeId: string;
  hash: string;
  node: ElementNodeCommand;
  children: { slotKey: string; orderIndex: number; childId: string; childHash: string }[];
}

export function hashElementGraph(
  nodes: ElementNodeCommand[],
  children: ElementChildCommand[],
): Map<string, ResolvedNodeHash> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string, ElementChildCommand[]>();
  for (const edge of children) {
    const siblings = childrenByParent.get(edge.parentId) ?? [];
    siblings.push(edge);
    childrenByParent.set(edge.parentId, siblings);
  }

  const resolved = new Map<string, ResolvedNodeHash>();

  function resolve(nodeId: string): ResolvedNodeHash {
    const cached = resolved.get(nodeId);
    if (cached) return cached;
    const node = nodesById.get(nodeId);
    if (!node) throw new Error(`hashElementGraph: unknown node ID ${nodeId}`);
    const edges = (childrenByParent.get(nodeId) ?? []).slice().sort((a, b) => a.orderIndex - b.orderIndex);
    const childHashes = edges.map((edge) => ({
      slotKey: edge.slotKey,
      orderIndex: edge.orderIndex,
      childId: edge.childId,
      childHash: resolve(edge.childId).hash,
    }));
    const hash = hashPayload({
      type: node.type,
      schemaVersion: node.schemaVersion,
      geometry: node.geometry as Geometry,
      props: node.props,
      animation: node.animation,
      children: childHashes.map(({ slotKey, orderIndex, childHash }) => [slotKey, orderIndex, childHash]),
    });
    const entry: ResolvedNodeHash = { nodeId, hash, node, children: childHashes };
    resolved.set(nodeId, entry);
    return entry;
  }

  for (const node of nodes) resolve(node.id);
  return resolved;
}

export function hashSlide(slide: SlideCommand, topLevelElementHashes: string[]): string {
  return hashPayload({
    width: slide.width,
    height: slide.height,
    props: slide.props,
    elements: topLevelElementHashes,
  });
}
