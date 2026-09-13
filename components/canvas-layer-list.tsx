"use client";

import type { CanvasLayer } from "@/hooks/use-slide-html-canvas";

export interface CanvasLayerListProps {
  layers: CanvasLayer[];
  onSelect(id: string): void;
  onMove(id: string, direction: "up" | "down"): void;
  disabled?: boolean;
}

export function CanvasLayerList({ layers, onSelect, onMove, disabled = false }: CanvasLayerListProps) {
  return (
    <nav aria-label="Layers" className="flex flex-col gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
      {layers.length === 0 ? <p className="px-2 py-1 text-xs text-[var(--muted)]">No components yet</p> : null}
      {layers.map((layer, index) => (
        <div
          className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-sm ${layer.selected ? "border-[var(--accent)] bg-blue-50 text-[var(--accent)]" : "border-transparent"}`}
          key={layer.id}
        >
          <button className="flex-1 truncate text-left" disabled={disabled} onClick={() => onSelect(layer.id)} type="button">
            {layer.name}
          </button>
          <div className="flex gap-1">
            <button aria-label={`Move ${layer.name} up`} className="text-xs underline" disabled={disabled || index === 0} onClick={() => onMove(layer.id, "up")} type="button">
              Up
            </button>
            <button aria-label={`Move ${layer.name} down`} className="text-xs underline" disabled={disabled || index === layers.length - 1} onClick={() => onMove(layer.id, "down")} type="button">
              Down
            </button>
          </div>
        </div>
      ))}
    </nav>
  );
}
