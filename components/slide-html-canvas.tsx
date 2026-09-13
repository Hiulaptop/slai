"use client";

import "grapesjs/dist/css/grapes.min.css";
import { forwardRef, useImperativeHandle } from "react";

import { useSlideHtmlCanvas } from "@/hooks/use-slide-html-canvas";
import { CanvasBlockPalette } from "@/components/canvas-block-palette";
import { CanvasLayerList } from "@/components/canvas-layer-list";
import { CanvasToolbar, type CanvasSaveState } from "@/components/canvas-toolbar";

export interface SlideHtmlCanvasHandle {
  // Serializes the current canvas state through the same content-safety
  // sanitizer the backend enforces (see modules/slides/domain/structured/
  // sanitize.ts): a frontend UX check, never the trust boundary itself.
  // Returns null (and surfaces an inline error) instead of throwing, so a
  // caller can simply skip the save on a null return.
  serialize(): { html: string; css: string } | null;
}

export interface SlideCanvasChrome {
  toolbar?: boolean;
  blockPalette?: boolean;
  layerList?: boolean;
}

export interface SlideHtmlCanvasProps {
  html: string;
  css: string;
  disabled?: boolean;
  onDirtyChange?(dirty: boolean): void;
  // Lets each host opt out of individual chrome pieces (e.g. a lighter
  // feedback-editor surface) while the underlying canvas behavior -
  // editing, serialization, error recovery - stays identical either way.
  // Defaults to every piece rendered.
  chrome?: SlideCanvasChrome;
  saveState?: CanvasSaveState;
}

export const SlideHtmlCanvas = forwardRef<SlideHtmlCanvasHandle, SlideHtmlCanvasProps>(function SlideHtmlCanvas(
  { html, css, disabled = false, onDirtyChange, chrome, saveState = "idle" },
  ref,
) {
  const canvas = useSlideHtmlCanvas({ html, css, disabled, onDirtyChange });
  const showToolbar = chrome?.toolbar ?? true;
  const showBlockPalette = chrome?.blockPalette ?? true;
  const showLayerList = chrome?.layerList ?? true;

  useImperativeHandle(ref, () => ({ serialize: canvas.serialize }));

  if (canvas.loadFailed) {
    return (
      <div className="rounded-2xl border border-[var(--danger)] bg-red-50 p-6 text-center text-sm text-[var(--danger)]" role="alert">
        The slide editor could not be loaded. Reload the page and try again.
      </div>
    );
  }

  return (
    <div className="relative">
      {showToolbar ? (
        <CanvasToolbar
          canRedo={canvas.canRedo}
          canUndo={canvas.canUndo}
          disabled={disabled}
          onRedo={canvas.redo}
          onUndo={canvas.undo}
          saveState={saveState}
        />
      ) : null}
      <div className={showBlockPalette || showLayerList ? "grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem]" : undefined}>
        <div
          aria-label="Slide canvas"
          className="mx-auto w-full max-w-[960px] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_50px_rgba(23,23,19,0.16)]"
          ref={canvas.containerRef}
          style={{ aspectRatio: "960 / 540", pointerEvents: disabled ? "none" : undefined, opacity: disabled ? 0.6 : undefined }}
        />
        {showBlockPalette || showLayerList ? (
          <div className="flex flex-col gap-3">
            {showBlockPalette ? <CanvasBlockPalette disabled={disabled} onAddBlock={canvas.addBlock} /> : null}
            {showLayerList ? (
              <CanvasLayerList disabled={disabled} layers={canvas.layers} onMove={canvas.moveLayer} onSelect={canvas.selectLayer} />
            ) : null}
          </div>
        ) : null}
      </div>
      {canvas.error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {canvas.error}
        </p>
      ) : null}
    </div>
  );
});
