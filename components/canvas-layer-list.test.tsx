// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CanvasLayerList } from "./canvas-layer-list";

const layers = [
  { id: "a", name: "Text", selected: false },
  { id: "b", name: "Heading", selected: true },
  { id: "c", name: "Row", selected: false },
];

describe("CanvasLayerList", () => {
  it("shows an empty state with no layers", () => {
    render(<CanvasLayerList layers={[]} onMove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByText("No components yet")).toBeVisible();
  });

  it("lists every layer and calls onSelect with its id", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CanvasLayerList layers={layers} onMove={vi.fn()} onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: "Text" }));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("highlights the selected layer", () => {
    render(<CanvasLayerList layers={layers} onMove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Heading" }).parentElement).toHaveClass("border-[var(--accent)]");
  });

  it("disables up on the first layer and down on the last, calling onMove otherwise", async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<CanvasLayerList layers={layers} onMove={onMove} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Move Text up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Row down" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Heading up" }));
    expect(onMove).toHaveBeenCalledWith("b", "up");
    await user.click(screen.getByRole("button", { name: "Move Heading down" }));
    expect(onMove).toHaveBeenCalledWith("b", "down");
  });

  it("reflects an add/remove/reorder without a reload (re-renders from the layers prop)", () => {
    const { rerender } = render(<CanvasLayerList layers={layers} onMove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /^(Text|Heading|Row)$/ })).toHaveLength(3);

    rerender(<CanvasLayerList layers={[...layers, { id: "d", name: "New block", selected: false }]} onMove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: "New block" })).toBeVisible();

    rerender(<CanvasLayerList layers={layers.filter((layer) => layer.id !== "a")} onMove={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Text" })).not.toBeInTheDocument();
  });
});
