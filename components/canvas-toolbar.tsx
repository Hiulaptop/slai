"use client";

export type CanvasSaveState = "idle" | "dirty" | "saving" | "saved";

const SAVE_STATE_LABEL: Record<CanvasSaveState, string> = {
  idle: "",
  dirty: "Unsaved changes",
  saving: "Saving...",
  saved: "Saved",
};

export interface CanvasToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo(): void;
  onRedo(): void;
  saveState?: CanvasSaveState;
  disabled?: boolean;
}

export function CanvasToolbar({ canUndo, canRedo, onUndo, onRedo, saveState = "idle", disabled = false }: CanvasToolbarProps) {
  const label = SAVE_STATE_LABEL[saveState];
  return (
    <div aria-label="Canvas toolbar" className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <div className="flex gap-1.5">
        <button aria-label="Undo" className="ui-button ui-button-secondary px-3 py-1 text-xs" disabled={disabled || !canUndo} onClick={onUndo} type="button">
          Undo
        </button>
        <button aria-label="Redo" className="ui-button ui-button-secondary px-3 py-1 text-xs" disabled={disabled || !canRedo} onClick={onRedo} type="button">
          Redo
        </button>
      </div>
      {label ? (
        <span aria-live="polite" className="text-xs font-semibold text-[var(--muted)]" role="status">
          {label}
        </span>
      ) : null}
    </div>
  );
}
