// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanvasToolbar } from "./canvas-toolbar";

describe("CanvasToolbar", () => {
  it("enables/disables undo and redo based on props", () => {
    render(<CanvasToolbar canRedo={false} canUndo={true} onRedo={vi.fn()} onUndo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("calls onUndo/onRedo when activated", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    render(<CanvasToolbar canRedo={true} canUndo={true} onRedo={onRedo} onUndo={onUndo} />);
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await user.click(screen.getByRole("button", { name: "Redo" }));
    expect(onUndo).toHaveBeenCalledOnce();
    expect(onRedo).toHaveBeenCalledOnce();
  });

  it.each([
    ["dirty", "Unsaved changes"],
    ["saving", "Saving..."],
    ["saved", "Saved"],
  ] as const)("shows the %s save-state label", (saveState, label) => {
    render(<CanvasToolbar canRedo={false} canUndo={false} onRedo={vi.fn()} onUndo={vi.fn()} saveState={saveState} />);
    expect(screen.getByRole("status")).toHaveTextContent(label);
  });

  it("shows no status region for idle (default) save state", () => {
    render(<CanvasToolbar canRedo={false} canUndo={false} onRedo={vi.fn()} onUndo={vi.fn()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("disables undo/redo when the toolbar itself is disabled, regardless of canUndo/canRedo", () => {
    render(<CanvasToolbar canRedo={true} canUndo={true} disabled onRedo={vi.fn()} onUndo={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });
});
