import { SlideError } from "../slide.errors";
import { assertGeometry, elementRegistry, slotMatches, type ChildPolicy } from "./element-registry";
import {
  MAX_ELEMENT_DEPTH,
  MAX_EDGES_PER_COMMAND,
  MAX_NODES_PER_COMMAND,
  MAX_SLIDES_PER_DOCUMENT,
  type ElementChildCommand,
  type ElementNodeCommand,
  type SlideCommand,
} from "./types";

interface ChildEdge {
  childId: string;
  slotKey: string;
  orderIndex: number;
}

function fail(message: string): never {
  throw new SlideError("INVALID_INPUT", message);
}

export function validateNodesAndChildren(nodes: ElementNodeCommand[], children: ElementChildCommand[]): Map<string, ElementNodeCommand> {
  if (nodes.length > MAX_NODES_PER_COMMAND) fail(`Command exceeds the maximum of ${MAX_NODES_PER_COMMAND} element nodes`);
  if (children.length > MAX_EDGES_PER_COMMAND) fail(`Command exceeds the maximum of ${MAX_EDGES_PER_COMMAND} child edges`);

  const nodesById = new Map<string, ElementNodeCommand>();
  for (const node of nodes) {
    if (nodesById.has(node.id)) fail(`Duplicate element node ID: ${node.id}`);
    nodesById.set(node.id, node);
  }

  for (const node of nodes) {
    elementRegistry.require(node.type, node.schemaVersion);
    elementRegistry.validateProps(node.type, node.schemaVersion, node.props);
    assertGeometry(node.geometry);
  }

  const childrenByParent = new Map<string, ChildEdge[]>();
  for (const edge of children) {
    if (!nodesById.has(edge.parentId)) fail(`Child edge references a parent ID outside this command: ${edge.parentId}`);
    if (!nodesById.has(edge.childId)) fail(`Child edge references a child ID outside this command: ${edge.childId}`);
    const siblings = childrenByParent.get(edge.parentId) ?? [];
    if (siblings.some((sibling) => sibling.slotKey === edge.slotKey)) {
      fail(`Duplicate child slot "${edge.slotKey}" under parent ${edge.parentId}`);
    }
    if (siblings.some((sibling) => sibling.orderIndex === edge.orderIndex)) {
      fail(`Duplicate child order index under parent ${edge.parentId}`);
    }
    siblings.push({ childId: edge.childId, slotKey: edge.slotKey, orderIndex: edge.orderIndex });
    childrenByParent.set(edge.parentId, siblings);
  }

  for (const [parentId, edges] of childrenByParent) {
    const parent = nodesById.get(parentId)!;
    if (!elementRegistry.isContainer(parent.type, parent.schemaVersion)) {
      fail(`Element ${parentId} of type ${parent.type} does not accept children`);
    }
    const policy = elementRegistry.childPolicy(parent.type, parent.schemaVersion);
    validateChildPolicy(parent.type, policy, edges, nodesById);
  }

  assertAcyclicAndNoSharedParents(children);

  return nodesById;
}

function validateChildPolicy(parentType: string, policy: ChildPolicy | undefined, edges: ChildEdge[], nodesById: Map<string, ElementNodeCommand>): void {
  if (!policy) fail(`Element type ${parentType} has no child policy but was given children`);
  const countBySlotRule = new Map<number, number>();
  for (const edge of edges) {
    const child = nodesById.get(edge.childId)!;
    const ruleIndex = policy.slots.findIndex((rule) => slotMatches(rule, edge.slotKey));
    if (ruleIndex === -1) fail(`Slot "${edge.slotKey}" is not permitted on ${parentType}`);
    const rule = policy.slots[ruleIndex];
    if (rule.allowedTypes !== "any" && !rule.allowedTypes.includes(child.type)) {
      fail(`Element type ${child.type} is not permitted in slot "${edge.slotKey}" of ${parentType}`);
    }
    const count = (countBySlotRule.get(ruleIndex) ?? 0) + 1;
    countBySlotRule.set(ruleIndex, count);
    if (rule.maxCount !== undefined && count > rule.maxCount) {
      fail(`Slot "${edge.slotKey}" on ${parentType} exceeds its maximum of ${rule.maxCount}`);
    }
  }
}

// Every node has at most one parent slot (`SlideElementChild`'s PK is
// `(parentElementNodeId, slotKey)`, but a child can only occupy one slot
// overall in this model - a node referenced as a child of two different
// parents, or twice under the same parent, would make the "immutable DAG"
// claim meaningless and open a cycle-through-diamond loophole cheaply
// avoided by rejecting it outright).
function assertAcyclicAndNoSharedParents(children: ElementChildCommand[]): void {
  const parentOf = new Map<string, string>();
  for (const edge of children) {
    if (parentOf.has(edge.childId)) fail(`Element ${edge.childId} cannot be a child of more than one parent`);
    parentOf.set(edge.childId, edge.parentId);
  }
  for (const childId of parentOf.keys()) {
    const seen = new Set<string>([childId]);
    let cursor: string | undefined = parentOf.get(childId);
    while (cursor !== undefined) {
      if (seen.has(cursor)) fail("Element graph contains a cycle");
      seen.add(cursor);
      cursor = parentOf.get(cursor);
    }
  }
}

function childrenOf(nodeId: string, children: ElementChildCommand[]): ElementChildCommand[] {
  return children.filter((edge) => edge.parentId === nodeId).sort((a, b) => a.orderIndex - b.orderIndex);
}

export function validateSlides(slides: SlideCommand[], nodesById: Map<string, ElementNodeCommand>, children: ElementChildCommand[]): void {
  if (!slides.length) fail("A structured document must contain at least one slide");
  if (slides.length > MAX_SLIDES_PER_DOCUMENT) fail(`A structured document cannot exceed ${MAX_SLIDES_PER_DOCUMENT} slides`);

  const numbers = new Set<number>();
  slides.forEach((slide, index) => {
    if (slide.number !== index + 1) fail("Slide numbers must be contiguous and one-based");
    if (numbers.has(slide.number)) fail(`Duplicate slide number: ${slide.number}`);
    numbers.add(slide.number);
    if (slide.width <= 0 || slide.height <= 0) fail(`Slide ${slide.number} must have a positive width and height`);
    slide.topLevelElementIds.forEach((id) => {
      if (!nodesById.has(id)) fail(`Slide ${slide.number} references an element ID outside this command: ${id}`);
    });
  });

  // Depth is edges-from-slide: a top-level element is depth 0, its children
  // depth 1, and so on. MAX_ELEMENT_DEPTH (4) bounds how many child edges a
  // command may nest, matching design.md's "maximum nesting depth is four
  // element edges".
  const reachable = new Set<string>();
  for (const slide of slides) {
    for (const id of slide.topLevelElementIds) walk(id, 0, reachable, children);
  }
  for (const id of nodesById.keys()) {
    if (!reachable.has(id)) fail(`Element ${id} is not reachable from any slide`);
  }
}

function walk(nodeId: string, depth: number, reachable: Set<string>, children: ElementChildCommand[]): void {
  if (depth > MAX_ELEMENT_DEPTH) fail(`Element nesting exceeds the maximum depth of ${MAX_ELEMENT_DEPTH}`);
  reachable.add(nodeId);
  for (const edge of childrenOf(nodeId, children)) {
    walk(edge.childId, depth + 1, reachable, children);
  }
}

export function validateStructuredCommand(nodes: ElementNodeCommand[], children: ElementChildCommand[], slides: SlideCommand[]): void {
  const nodesById = validateNodesAndChildren(nodes, children);
  validateSlides(slides, nodesById, children);
}
