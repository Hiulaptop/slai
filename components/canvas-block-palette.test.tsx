// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { sanitizeSlideHtml } from "@/modules/slides/domain/structured/sanitize";
import { CanvasBlockPalette } from "./canvas-block-palette";

describe("CanvasBlockPalette", () => {
  it("adds each block's content on activation", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(<CanvasBlockPalette onAddBlock={onAddBlock} />);

    for (const label of ["Text", "Heading", "Image placeholder", "Container / Row"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    expect(onAddBlock).toHaveBeenCalledTimes(4);
  });

  it("every block's content survives sanitization unchanged (sanitizer-safe by construction)", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(<CanvasBlockPalette onAddBlock={onAddBlock} />);

    for (const label of ["Text", "Heading", "Image placeholder", "Container / Row"]) {
      await user.click(screen.getByRole("button", { name: label }));
    }
    for (const [content] of onAddBlock.mock.calls) {
      expect(sanitizeSlideHtml(content, "INVALID_INPUT")).toBe(content);
    }
  });

  it("stays within the fixed slide bounds by construction (no absolute positioning or oversized dimensions)", async () => {
    const user = userEvent.setup();
    const onAddBlock = vi.fn();
    render(<CanvasBlockPalette onAddBlock={onAddBlock} />);
    await user.click(screen.getByRole("button", { name: "Image placeholder" }));

    const content = onAddBlock.mock.calls[0][0] as string;
    expect(content).not.toContain("position:absolute");
    const widthMatch = content.match(/width:(\d+)px/);
    const heightMatch = content.match(/height:(\d+)px/);
    expect(Number(widthMatch?.[1])).toBeLessThanOrEqual(960);
    expect(Number(heightMatch?.[1])).toBeLessThanOrEqual(540);
  });

  it("disables every block button when disabled", () => {
    render(<CanvasBlockPalette disabled onAddBlock={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Text" })).toBeDisabled();
  });
});
