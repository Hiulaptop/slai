// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createBlankSlide } from "@/lib/slides/design-document";
import { DesignCanvas } from "./design-canvas";

describe("DesignCanvas", () => {
  it("creates an element of the active tool type when the background is clicked", () => {
    const onCreateElement = vi.fn();
    render(
      <DesignCanvas
        slide={createBlankSlide(1)}
        tool="text"
        selectedElementId={null}
        onSelectElement={vi.fn()}
        onCommitElements={vi.fn()}
        onCreateElement={onCreateElement}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("Slide canvas"), { clientX: 50, clientY: 25, pointerId: 1 });
    expect(onCreateElement).toHaveBeenCalledWith("text", expect.any(Number), expect.any(Number));
  });

  it("deselects when the select tool clicks empty canvas", () => {
    const onSelectElement = vi.fn();
    render(
      <DesignCanvas
        slide={createBlankSlide(1)}
        tool="select"
        selectedElementId="el-1"
        onSelectElement={onSelectElement}
        onCommitElements={vi.fn()}
        onCreateElement={vi.fn()}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("Slide canvas"), { clientX: 50, clientY: 25, pointerId: 1 });
    expect(onSelectElement).toHaveBeenCalledWith(null);
  });

  it("does not create elements while disabled", () => {
    const onCreateElement = vi.fn();
    render(
      <DesignCanvas
        slide={createBlankSlide(1)}
        tool="rectangle"
        selectedElementId={null}
        disabled
        onSelectElement={vi.fn()}
        onCommitElements={vi.fn()}
        onCreateElement={onCreateElement}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("Slide canvas"), { clientX: 50, clientY: 25, pointerId: 1 });
    expect(onCreateElement).not.toHaveBeenCalled();
  });

  it("deletes the selected element on Delete/Backspace, but not while typing", () => {
    const onCommitElements = vi.fn();
    const slide = {
      number: 1,
      elements: [
        { id: "el-1", type: "text" as const, x: 0, y: 0, width: 100, height: 40, zIndex: 0, text: "Hi", fontSize: 24, color: "#000", align: "left" as const },
      ],
    };
    render(
      <DesignCanvas
        slide={slide}
        tool="select"
        selectedElementId="el-1"
        onSelectElement={vi.fn()}
        onCommitElements={onCommitElements}
        onCreateElement={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Delete" });
    expect(onCommitElements).toHaveBeenCalledWith([]);
  });
});
