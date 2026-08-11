"use client";

import { createElement, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactElement } from "react";

import {
  clampToSlide,
  CURRENT_ANIMATION_REGISTRY_VERSION,
  DEFAULT_ELEMENT_SIZE,
  elementRegistry,
  isTextElement,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type CanvasToolKind,
  type ElementNode,
  type SlideDocument,
} from "@/lib/slides/design-document";
import type { RenderNode } from "@/modules/slides/domain/structured/element-registry";

export type CanvasTool = "select" | CanvasToolKind;

type ResizeHandle = "nw" | "ne" | "sw" | "se";

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DragState {
  kind: "move" | "resize";
  elementId: string;
  handle?: ResizeHandle;
  pointerId: number;
  startPointerX: number;
  startPointerY: number;
  startBounds: Bounds;
}

function elementBounds(element: ElementNode): Bounds {
  return { x: element.geometry.x ?? 0, y: element.geometry.y ?? 0, width: element.geometry.width ?? DEFAULT_ELEMENT_SIZE.rectangle.width, height: element.geometry.height ?? DEFAULT_ELEMENT_SIZE.rectangle.height };
}

function withBounds(element: ElementNode, bounds: Bounds): ElementNode {
  return { ...element, geometry: { ...element.geometry, x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } };
}

export function DesignCanvas({
  slide,
  tool,
  selectedElementId,
  disabled = false,
  onSelectElement,
  onCommitElements,
  onCreateElement,
}: {
  slide: SlideDocument;
  tool: CanvasTool;
  selectedElementId: string | null;
  disabled?: boolean;
  onSelectElement(id: string | null): void;
  onCommitElements(elements: ElementNode[]): void;
  onCreateElement(type: CanvasToolKind, x: number, y: number): void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftElements, setDraftElements] = useState<ElementNode[] | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setScale(width / SLIDE_WIDTH);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (disabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (editingTextId) return;
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (isTextEntryTarget(event.target)) return;
      if (!selectedElementId) return;
      event.preventDefault();
      onCommitElements(slide.elements.filter((element) => element.id !== selectedElementId));
      onSelectElement(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [disabled, editingTextId, onCommitElements, onSelectElement, selectedElementId, slide.elements]);

  const elements = draftElements ?? slide.elements;

  function slidePoint(event: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !scale) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  }

  function handleBackgroundClick(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled) return;
    if (tool === "select") {
      onSelectElement(null);
      return;
    }
    const point = slidePoint(event);
    const size = DEFAULT_ELEMENT_SIZE[tool];
    onCreateElement(tool, point.x - size.width / 2, point.y - size.height / 2);
  }

  function beginMove(event: ReactPointerEvent<Element>, element: ElementNode) {
    if (disabled || tool !== "select") return;
    event.stopPropagation();
    onSelectElement(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: "move", elementId: element.id, pointerId: event.pointerId, startPointerX: event.clientX, startPointerY: event.clientY, startBounds: elementBounds(element) });
  }

  function beginResize(event: ReactPointerEvent<Element>, element: ElementNode, handle: ResizeHandle) {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ kind: "resize", elementId: element.id, handle, pointerId: event.pointerId, startPointerX: event.clientX, startPointerY: event.clientY, startBounds: elementBounds(element) });
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag || !scale) return;
    const deltaX = (event.clientX - drag.startPointerX) / scale;
    const deltaY = (event.clientY - drag.startPointerY) / scale;

    const next = slide.elements.map((element) => {
      if (element.id !== drag.elementId) return element;
      const bounds =
        drag.kind === "move"
          ? clampToSlide({ x: drag.startBounds.x + deltaX, y: drag.startBounds.y + deltaY, width: drag.startBounds.width, height: drag.startBounds.height })
          : resizeBounds(drag.startBounds, drag.handle ?? "se", deltaX, deltaY);
      return withBounds(element, bounds);
    });
    setDraftElements(next);
  }

  function endDrag() {
    if (drag && draftElements) onCommitElements(draftElements);
    setDrag(null);
    setDraftElements(null);
  }

  function commitText(elementId: string, text: string) {
    onCommitElements(
      slide.elements.map((element) => (element.id === elementId && isTextElement(element) ? { ...element, props: { ...element.props, text } } : element)),
    );
  }

  const selected = elements.find((element) => element.id === selectedElementId) ?? null;

  return (
    <div
      className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_50px_rgba(23,23,19,0.16)]"
      style={{ aspectRatio: `${SLIDE_WIDTH} / ${SLIDE_HEIGHT}` }}
      ref={containerRef}
    >
      <div
        aria-label="Slide canvas"
        className="absolute top-0 left-0 origin-top-left"
        onPointerDown={handleBackgroundClick}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="presentation"
        style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})`, cursor: tool === "select" ? "default" : "crosshair" }}
      >
        {[...elements].sort((a, b) => (a.geometry.zIndex ?? 0) - (b.geometry.zIndex ?? 0)).map((element) => (
          <CanvasElement
            key={element.id}
            element={element}
            editing={editingTextId === element.id}
            onStartEdit={() => tool === "select" && isTextElement(element) && setEditingTextId(element.id)}
            onCommitText={(text) => {
              commitText(element.id, text);
              setEditingTextId(null);
            }}
            onPointerDown={(event) => beginMove(event, element)}
          />
        ))}
        {selected && !editingTextId && tool === "select" ? (
          <SelectionOutline element={selected} onResizeStart={(event, handle) => beginResize(event, selected, handle)} />
        ) : null}
      </div>
    </div>
  );
}

function attrsToProps(attrs: Record<string, string> | undefined): Record<string, unknown> {
  if (!attrs) return {};
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) props[key === "class" ? "className" : key] = value;
  return props;
}

function styleObjectFrom(style: Record<string, string | number> | undefined): CSSProperties {
  if (!style) return {};
  const result: Record<string, string | number> = {};
  for (const [property, value] of Object.entries(style)) {
    const camel = property.startsWith("--") ? property : property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
    result[camel] = value;
  }
  return result as CSSProperties;
}

// Generic RenderNode -> React element conversion, shared by every element
// type through the registry's render() output - this is what keeps the
// canvas free of per-type rendering branches (task 6.1's "registry-backed
// dispatch"); only the interactive wrapper below is per-element-instance,
// never per-type.
function renderNodeToJsx(node: RenderNode, key?: React.Key): ReactElement {
  const props: Record<string, unknown> = { key, style: styleObjectFrom(node.style), ...attrsToProps(node.attrs) };
  const children = node.children?.map((child, index) => renderNodeToJsx(child, index));
  return createElement(node.tag, props, node.text ?? children);
}

function CanvasElement({
  element,
  editing,
  onStartEdit,
  onCommitText,
  onPointerDown,
}: {
  element: ElementNode;
  editing: boolean;
  onStartEdit(): void;
  onCommitText(text: string): void;
  onPointerDown(event: ReactPointerEvent<Element>): void;
}) {
  const position: CSSProperties = {
    position: "absolute",
    left: element.geometry.x ?? 0,
    top: element.geometry.y ?? 0,
    width: element.geometry.width ?? undefined,
    height: element.geometry.height ?? undefined,
    zIndex: element.geometry.zIndex ?? 0,
  };

  if (isTextElement(element) && editing) {
    const props = element.props;
    return (
      <textarea
        autoFocus
        className="resize-none rounded border-2 border-[var(--accent)] p-1 text-left outline-none"
        defaultValue={props.text}
        onBlur={(event) => onCommitText(event.target.value)}
        style={{ ...position, fontSize: props.fontSize, color: props.color, textAlign: props.align, fontWeight: props.bold ? 700 : props.fontWeight, fontStyle: props.italic ? "italic" : "normal" }}
      />
    );
  }

  const rendered = elementRegistry.render(CURRENT_ANIMATION_REGISTRY_VERSION, element);
  const style = { ...styleObjectFrom(rendered.style), ...position };
  const props: Record<string, unknown> = {
    style,
    className: "cursor-move",
    onPointerDown,
    onDoubleClick: isTextElement(element) ? onStartEdit : undefined,
    ...attrsToProps(rendered.attrs),
  };
  const children = rendered.children?.map((child, index) => renderNodeToJsx(child, index));
  return createElement(rendered.tag, props, rendered.text ?? children);
}

function SelectionOutline({ element, onResizeStart }: { element: ElementNode; onResizeStart(event: ReactPointerEvent<Element>, handle: ResizeHandle): void }) {
  const handles: ResizeHandle[] = ["nw", "ne", "sw", "se"];
  const bounds = elementBounds(element);
  return (
    <div
      className="pointer-events-none absolute border-2 border-dashed border-[var(--accent)]"
      style={{ left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height, zIndex: 9999 }}
    >
      {handles.map((handle) => (
        <span
          aria-label={`Resize ${handle}`}
          className="pointer-events-auto absolute size-3 rounded-full border-2 border-[var(--accent)] bg-white"
          key={handle}
          onPointerDown={(event) => onResizeStart(event, handle)}
          role="button"
          style={handleStyle(handle)}
        />
      ))}
    </div>
  );
}

function handleStyle(handle: ResizeHandle): { top: number | string; left: number | string; transform: string } {
  const top = handle.startsWith("n") ? "0%" : "100%";
  const left = handle.endsWith("w") ? "0%" : "100%";
  return { top, left, transform: "translate(-50%, -50%)" };
}

function resizeBounds(start: Bounds, handle: ResizeHandle, dx: number, dy: number): Bounds {
  let { x, y, width, height } = start;
  if (handle === "se") {
    width += dx;
    height += dy;
  } else if (handle === "sw") {
    x += dx;
    width -= dx;
    height += dy;
  } else if (handle === "ne") {
    y += dy;
    width += dx;
    height -= dy;
  } else {
    x += dx;
    y += dy;
    width -= dx;
    height -= dy;
  }
  return clampToSlide({ x, y, width, height });
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches("input, textarea, select"));
}

export { SLIDE_WIDTH as CANVAS_SLIDE_WIDTH, SLIDE_HEIGHT as CANVAS_SLIDE_HEIGHT };
