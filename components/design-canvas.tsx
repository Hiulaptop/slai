"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import {
  clampToSlide,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type DesignSlide,
  type SlideElement,
  type SlideElementType,
} from "@/lib/slides/design-document";

export type CanvasTool = "select" | SlideElementType;

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

export const DEFAULT_ELEMENT_SIZE: Record<SlideElementType, { width: number; height: number }> = {
  text: { width: 260, height: 48 },
  rectangle: { width: 180, height: 100 },
  ellipse: { width: 160, height: 120 },
  line: { width: 200, height: 100 },
  image: { width: 220, height: 160 },
};

export function DesignCanvas({
  slide,
  tool,
  selectedElementId,
  disabled = false,
  onSelectElement,
  onCommitElements,
  onCreateElement,
}: {
  slide: DesignSlide;
  tool: CanvasTool;
  selectedElementId: string | null;
  disabled?: boolean;
  onSelectElement(id: string | null): void;
  onCommitElements(elements: SlideElement[]): void;
  onCreateElement(type: SlideElementType, x: number, y: number): void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draftElements, setDraftElements] = useState<SlideElement[] | null>(null);
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

  function beginMove(event: ReactPointerEvent<Element>, element: SlideElement) {
    if (disabled || tool !== "select") return;
    event.stopPropagation();
    onSelectElement(element.id);
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: "move",
      elementId: element.id,
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startBounds: { x: element.x, y: element.y, width: element.width, height: element.height },
    });
  }

  function beginResize(event: ReactPointerEvent<Element>, element: SlideElement, handle: ResizeHandle) {
    if (disabled) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      kind: "resize",
      elementId: element.id,
      handle,
      pointerId: event.pointerId,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startBounds: { x: element.x, y: element.y, width: element.width, height: element.height },
    });
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
      return { ...element, ...bounds };
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
      slide.elements.map((element) => (element.id === elementId && element.type === "text" ? { ...element, text } : element)),
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
        {[...elements].sort((a, b) => a.zIndex - b.zIndex).map((element) => (
          <CanvasElement
            key={element.id}
            element={element}
            editing={editingTextId === element.id}
            onStartEdit={() => tool === "select" && element.type === "text" && setEditingTextId(element.id)}
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

function CanvasElement({
  element,
  editing,
  onStartEdit,
  onCommitText,
  onPointerDown,
}: {
  element: SlideElement;
  editing: boolean;
  onStartEdit(): void;
  onCommitText(text: string): void;
  onPointerDown(event: ReactPointerEvent<Element>): void;
}) {
  const style = { position: "absolute" as const, left: element.x, top: element.y, width: element.width, height: element.height, zIndex: element.zIndex };

  if (element.type === "text") {
    if (editing) {
      return (
        <textarea
          autoFocus
          className="resize-none rounded border-2 border-[var(--accent)] p-1 text-left outline-none"
          defaultValue={element.text}
          onBlur={(event) => onCommitText(event.target.value)}
          style={{ ...style, fontSize: element.fontSize, color: element.color, textAlign: element.align }}
        />
      );
    }
    return (
      <div
        className="cursor-move overflow-hidden break-words"
        onDoubleClick={onStartEdit}
        onPointerDown={onPointerDown}
        style={{ ...style, fontSize: element.fontSize, color: element.color, textAlign: element.align }}
      >
        {element.text || "Text"}
      </div>
    );
  }

  if (element.type === "rectangle" || element.type === "ellipse") {
    return (
      <div
        className="cursor-move"
        onPointerDown={onPointerDown}
        style={{ ...style, background: element.fill, border: `2px solid ${element.stroke}`, borderRadius: element.type === "ellipse" ? "50%" : undefined }}
      />
    );
  }

  if (element.type === "line") {
    return (
      <svg className="cursor-move" onPointerDown={onPointerDown} style={style} viewBox={`0 0 ${element.width} ${element.height}`} preserveAspectRatio="none">
        <line x1="0" y1="0" x2={element.width} y2={element.height} stroke={element.stroke} strokeWidth={2} />
      </svg>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- local data: URL, next/image cannot optimize it and adds no value here
    <img alt={element.alt} className="cursor-move object-contain" onPointerDown={onPointerDown} src={element.src} style={style} />
  );
}

function SelectionOutline({ element, onResizeStart }: { element: SlideElement; onResizeStart(event: ReactPointerEvent<Element>, handle: ResizeHandle): void }) {
  const handles: ResizeHandle[] = ["nw", "ne", "sw", "se"];
  return (
    <div
      className="pointer-events-none absolute border-2 border-dashed border-[var(--accent)]"
      style={{ left: element.x, top: element.y, width: element.width, height: element.height, zIndex: 9999 }}
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
