// Client-side scene graph for the visual slide design editor. This is
// deliberately the SAME shape as the backend read model
// (modules/slides/domain/structured/types.ts's ElementNode/SlideDocument) and
// reuses the actual element registry (modules/slides/domain/structured/elements)
// for defaults, prop schemas, and portable rendering - see design.md's "one
// versioned element registry for validation, creation, structured parsing,
// and rendering" and task 6.1's "replace independent parser, serializer,
// creation, and rendering fallthrough branches with registry-backed
// dispatch". The registry has no Node-only dependencies, so it runs
// identically here in the browser and on the server.

import { elementRegistry as registry } from "@/modules/slides/domain/structured/elements";
import { ALLOWED_IMAGE_SRC } from "@/modules/slides/domain/structured/elements/image";
import type { ShapeProps } from "@/modules/slides/domain/structured/elements/shape";
import { tableSlotKey, type TableProps } from "@/modules/slides/domain/structured/elements/table";
import type { TableCellProps } from "@/modules/slides/domain/structured/elements/table-cell";
import type { TextProps } from "@/modules/slides/domain/structured/elements/text";
import type { WireElement, WireSlide } from "@/modules/slides/domain/structured/compose";
import type { AnimationReference, ElementChild, ElementNode, Geometry, SlideDocument } from "@/modules/slides/domain/structured/types";

export { elementRegistry } from "@/modules/slides/domain/structured/elements";
export { animationRegistry, CURRENT_ANIMATION_REGISTRY_VERSION } from "@/modules/slides/domain/structured/animation-registry";
export { TEXT_STYLE_PRESETS, TEXT_STYLE_TYPES, type TextStyleType } from "@/modules/slides/domain/structured/elements/text";
export type { ShapeProps, TableCellProps, TableProps, TextProps };
export type { AnimationReference, ElementChild, ElementNode, SlideDocument };

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
const MIN_ELEMENT_SIZE = 8;

// Canvas tool identifiers are UI-level, not domain element types: the three
// shape variants share one registered "shape" type (distinguished by
// props.shapeType) but get separate palette buttons and default sizes.
export type CanvasToolKind = "text" | "rectangle" | "ellipse" | "line" | "image" | "table";

let elementCounter = 0;

export function createElementId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  elementCounter += 1;
  return `el-${Date.now()}-${elementCounter}`;
}

export function isAllowedImageSrc(src: string): boolean {
  return ALLOWED_IMAGE_SRC.test(src);
}

export function clampToSlide(bounds: { x: number; y: number; width: number; height: number }): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const width = Math.max(MIN_ELEMENT_SIZE, Math.min(bounds.width, SLIDE_WIDTH));
  const height = Math.max(MIN_ELEMENT_SIZE, Math.min(bounds.height, SLIDE_HEIGHT));
  const x = Math.max(0, Math.min(bounds.x, SLIDE_WIDTH - width));
  const y = Math.max(0, Math.min(bounds.y, SLIDE_HEIGHT - height));
  return { x, y, width, height };
}

export function createBlankSlide(number: number): SlideDocument {
  return { number, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [] };
}

export function createBlankDocument(slideCount: number): SlideDocument[] {
  const count = Math.max(1, Math.min(50, Math.trunc(slideCount) || 1));
  return Array.from({ length: count }, (_, index) => createBlankSlide(index + 1));
}

export function renumberSlides(slides: SlideDocument[]): SlideDocument[] {
  return slides.map((slide, index) => (slide.number === index + 1 ? slide : { ...slide, number: index + 1 }));
}

// --- Type narrowing helpers -------------------------------------------
// The registry's props are `unknown` by design (see types.ts) so a schema
// update never requires touching this file; these predicates narrow just
// enough for the editor's property panels to read/write typed fields.

export function isTextElement(node: ElementNode): node is ElementNode & { type: "text"; props: TextProps } {
  return node.type === "text";
}
export function isShapeElement(node: ElementNode): node is ElementNode & { type: "shape"; props: ShapeProps } {
  return node.type === "shape";
}
export function isImageElement(node: ElementNode): node is ElementNode & { type: "image" } {
  return node.type === "image";
}
export function isTableElement(node: ElementNode): node is ElementNode & { type: "table"; props: TableProps } {
  return node.type === "table";
}

// --- Element creation ---------------------------------------------------

export const DEFAULT_ELEMENT_SIZE: Record<CanvasToolKind, { width: number; height: number }> = {
  text: { width: 260, height: 60 },
  rectangle: { width: 180, height: 100 },
  ellipse: { width: 160, height: 120 },
  line: { width: 200, height: 100 },
  image: { width: 220, height: 160 },
  table: { width: 480, height: 200 },
};

function baseGeometry(x: number, y: number, width: number, height: number, zIndex: number): Geometry {
  const bounds = clampToSlide({ x, y, width, height });
  return { ...bounds, zIndex };
}

export function createTextElement(x: number, y: number, zIndex: number): ElementNode {
  return {
    id: createElementId(),
    type: "text",
    schemaVersion: 1,
    geometry: baseGeometry(x, y, DEFAULT_ELEMENT_SIZE.text.width, DEFAULT_ELEMENT_SIZE.text.height, zIndex),
    props: registry.createDefaults("text", 1),
    animation: null,
    children: [],
  };
}

export function createShapeElement(shapeType: ShapeProps["shapeType"], x: number, y: number, zIndex: number): ElementNode {
  const defaults = registry.createDefaults("shape", 1) as ShapeProps;
  const size = DEFAULT_ELEMENT_SIZE[shapeType];
  return {
    id: createElementId(),
    type: "shape",
    schemaVersion: 1,
    geometry: baseGeometry(x, y, size.width, size.height, zIndex),
    props: { ...defaults, shapeType },
    animation: null,
    children: [],
  };
}

export function createImageElement(src: string, alt: string, x: number, y: number, zIndex: number): ElementNode {
  return {
    id: createElementId(),
    type: "image",
    schemaVersion: 1,
    geometry: baseGeometry(x, y, DEFAULT_ELEMENT_SIZE.image.width, DEFAULT_ELEMENT_SIZE.image.height, zIndex),
    props: { src, alt },
    animation: null,
    children: [],
  };
}

function createTableCellElement(row: number, column: number): ElementNode {
  const defaults = registry.createDefaults("table-cell", 1) as TableCellProps;
  return {
    id: createElementId(),
    type: "table-cell",
    schemaVersion: 1,
    geometry: { x: null, y: null, width: null, height: null, zIndex: null },
    props: { ...defaults, row, column },
    animation: null,
    children: [],
  };
}

export function createTableElement(rows: number, columns: number, x: number, y: number, zIndex: number): ElementNode {
  const defaults = registry.createDefaults("table", 1) as TableProps;
  const children: ElementChild[] = [];
  let orderIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      children.push({ slotKey: tableSlotKey(row, column), orderIndex, element: createTableCellElement(row, column) });
      orderIndex += 1;
    }
  }
  return {
    id: createElementId(),
    type: "table",
    schemaVersion: 1,
    geometry: baseGeometry(x, y, DEFAULT_ELEMENT_SIZE.table.width, DEFAULT_ELEMENT_SIZE.table.height, zIndex),
    props: { ...defaults, rows, columns },
    animation: null,
    children,
  };
}

// --- Table editing helpers ----------------------------------------------

export function tableCellAt(table: ElementNode, row: number, column: number): ElementNode | null {
  const slotKey = tableSlotKey(row, column);
  return table.children.find((child) => child.slotKey === slotKey)?.element ?? null;
}

// Resizes a table's grid, preserving existing cell content by slot key and
// creating blank cells for newly added slots; cells outside the new bounds
// are dropped (their content is discarded, matching a spreadsheet-style
// resize rather than an undo-able trim).
export function resizeTable(table: ElementNode, rows: number, columns: number): ElementNode {
  const props = table.props as TableProps;
  const children: ElementChild[] = [];
  let orderIndex = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const existing = tableCellAt(table, row, column);
      children.push({ slotKey: tableSlotKey(row, column), orderIndex, element: existing ?? createTableCellElement(row, column) });
      orderIndex += 1;
    }
  }
  return { ...table, props: { ...props, rows, columns }, children };
}

const NULL_GEOMETRY: Geometry = { x: null, y: null, width: null, height: null, zIndex: null };

// Replaces a cell's single content child (slot "content"), or clears it when
// `content` is null - a cell holds at most one child by construction (see
// table-cell.ts's childPolicy). Content geometry is always cleared: cell
// content flows within the cell's CSS table layout rather than being
// absolutely positioned on the canvas (see render.ts's geometryStyle, which
// only emits position:absolute when geometry is non-null).
export function setTableCellContent(table: ElementNode, row: number, column: number, content: ElementNode | null): ElementNode {
  const slotKey = tableSlotKey(row, column);
  return {
    ...table,
    children: table.children.map((child) => {
      if (child.slotKey !== slotKey) return child;
      const cell = child.element;
      const flowContent = content ? { ...content, geometry: NULL_GEOMETRY } : null;
      return { ...child, element: { ...cell, children: flowContent ? [{ slotKey: "content", orderIndex: 0, element: flowContent }] : [] } };
    }),
  };
}

export function tableCellContent(table: ElementNode, row: number, column: number): ElementNode | null {
  const cell = tableCellAt(table, row, column);
  return cell?.children[0]?.element ?? null;
}

// --- Wire (server) conversion --------------------------------------------

function toWireElement(node: ElementNode): WireElement {
  const hasGeometry = node.geometry.x !== null || node.geometry.y !== null || node.geometry.width !== null || node.geometry.height !== null || node.geometry.zIndex !== null;
  return {
    type: node.type,
    geometry: hasGeometry
      ? {
          x: node.geometry.x ?? 0,
          y: node.geometry.y ?? 0,
          width: node.geometry.width ?? MIN_ELEMENT_SIZE,
          height: node.geometry.height ?? MIN_ELEMENT_SIZE,
          zIndex: node.geometry.zIndex ?? 0,
        }
      : null,
    props: node.props,
    animation: node.animation ? { key: node.animation.key, durationMs: node.animation.props.durationMs as number | undefined, delayMs: node.animation.props.delayMs as number | undefined } : null,
    children: node.children
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((child) => ({ slotKey: child.slotKey, element: toWireElement(child.element) })),
  };
}

export function toWireSlides(slides: SlideDocument[]): WireSlide[] {
  return renumberSlides(slides).map((slide) => ({
    number: slide.number,
    width: slide.width,
    height: slide.height,
    ...(typeof slide.props.backgroundColor === "string" ? { backgroundColor: slide.props.backgroundColor } : {}),
    elements: slide.elements.map(toWireElement),
  }));
}
