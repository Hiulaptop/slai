// Shared structured-document DTOs. Two distinct shapes exist by design:
//
// - "Command" types (ElementNodeCommand, ElementChildCommand, SlideCommand,
//   StructuredDocumentCommand) describe what a caller (AI adapter or the
//   design editor) submits to create or replace slides. They are a flat
//   node+edge graph with client-assigned string IDs so the graph validator
//   can meaningfully detect cycles, duplicate IDs, and unreachable nodes -
//   a nested tree could never fail those checks, so the wire format must be
//   flat to make the spec's validation scenarios possible.
// - Read-model types (ElementNode, SlideDocument, StructuredRevision) are the
//   resolved, already-validated shapes assembled by the repository from
//   persisted rows. Children are nested and ordered here, since callers of a
//   read model want a tree, not a graph they must reassemble themselves.
//
// Persistence content-addresses nodes (see modules/slides/infrastructure) so
// structural sharing is automatic: submitting the same (type, schemaVersion,
// geometry, props, animation, children) as an existing node reuses that row
// instead of creating a duplicate - callers never reference old node IDs.

export interface Geometry {
  x: number | null;
  y: number | null;
  width: number | null;
  height: number | null;
  zIndex: number | null;
}

export interface AnimationReference {
  key: string;
  props: Record<string, unknown>;
}

// --- Write commands ---------------------------------------------------

export interface ElementNodeCommand {
  id: string;
  type: string;
  schemaVersion: number;
  geometry: Geometry;
  props: unknown;
  animation: AnimationReference | null;
}

export interface ElementChildCommand {
  parentId: string;
  childId: string;
  slotKey: string;
  orderIndex: number;
}

export interface SlideCommand {
  number: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  topLevelElementIds: string[];
}

export interface StructuredDocumentCommand {
  animationRegistryVersion: number;
  nodes: ElementNodeCommand[];
  children: ElementChildCommand[];
  slides: SlideCommand[];
}

// A batch edit only submits replacement slides; every slide number absent
// from `replacements` keeps its existing immutable snapshot reference.
export interface StructuredEditCommand {
  animationRegistryVersion: number;
  nodes: ElementNodeCommand[];
  children: ElementChildCommand[];
  replacements: SlideCommand[];
}

// --- Read models --------------------------------------------------------

export interface ElementNode {
  id: string;
  type: string;
  schemaVersion: number;
  geometry: Geometry;
  props: unknown;
  animation: AnimationReference | null;
  children: ElementChild[];
}

export interface ElementChild {
  slotKey: string;
  orderIndex: number;
  element: ElementNode;
}

export interface SlideDocument {
  number: number;
  width: number;
  height: number;
  props: Record<string, unknown>;
  elements: ElementNode[];
}

export interface StructuredRevision {
  animationRegistryVersion: number;
  slides: SlideDocument[];
}

export const MAX_ELEMENT_DEPTH = 4;
export const MAX_NODES_PER_COMMAND = 2_000;
export const MAX_EDGES_PER_COMMAND = 2_000;
export const MAX_SLIDES_PER_DOCUMENT = 50;
