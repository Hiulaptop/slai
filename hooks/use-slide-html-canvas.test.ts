// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const grapes = vi.hoisted(() => {
  let undoStack = 0;
  const handlers: Array<[string, () => void]> = [];
  const wrapper = { components: () => ({ models: [] as unknown[] }), append: vi.fn() };
  const editor = {
    setComponents: vi.fn(),
    setStyle: vi.fn(),
    getHtml: vi.fn(() => "<p>hello</p>"),
    getCss: vi.fn(() => ".x{color:red}"),
    on: vi.fn((events: string, handler: () => void) => handlers.push([events, handler])),
    destroy: vi.fn(),
    getWrapper: () => wrapper,
    getSelected: () => undefined,
    select: vi.fn(),
    UndoManager: {
      clear: vi.fn(() => { undoStack = 0; }),
      hasUndo: vi.fn(() => undoStack > 0),
      hasRedo: vi.fn(() => false),
      undo: vi.fn(() => { undoStack -= 1; }),
      redo: vi.fn(),
    },
  };
  const emit = (event: string) => handlers.filter(([events]) => events.split(" ").includes(event)).forEach(([, handler]) => handler());
  const recordEdit = () => { undoStack += 1; emit("component:update"); };
  const reset = () => { undoStack = 0; handlers.length = 0; };
  return { editor, wrapper, emit, recordEdit, reset };
});

vi.mock("grapesjs", () => ({ default: { init: vi.fn(() => grapes.editor) } }));

import { useSlideHtmlCanvas } from "./use-slide-html-canvas";

function mountHook(initial: { html: string; css: string; onDirtyChange?: (dirty: boolean) => void }) {
  const container = document.createElement("div");
  return renderHook((props) => {
    const canvas = useSlideHtmlCanvas(props);
    // Simulate the view attaching the container before effects run.
    if (!canvas.containerRef.current) canvas.containerRef.current = container;
    return canvas;
  }, { initialProps: initial });
}

beforeEach(() => {
  vi.clearAllMocks();
  grapes.reset();
  grapes.editor.getHtml.mockReturnValue("<p>hello</p>");
  grapes.editor.getCss.mockReturnValue(".x{color:red}");
});

describe("useSlideHtmlCanvas", () => {
  it("loads html/css on mount without making the initial load undoable", async () => {
    const { result } = mountHook({ html: "<p>hello</p>", css: ".x{color:red}" });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    expect(grapes.editor.setComponents).toHaveBeenCalledWith("<p>hello</p>");
    expect(grapes.editor.setStyle).toHaveBeenCalledWith(".x{color:red}");
    expect(grapes.editor.UndoManager.clear).toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });

  it("resyncs from changed props but not from an inline callback's new identity", async () => {
    const { result, rerender } = mountHook({ html: "<p>one</p>", css: "", onDirtyChange: () => undefined });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    grapes.editor.setComponents.mockClear();

    rerender({ html: "<p>one</p>", css: "", onDirtyChange: () => undefined });
    expect(grapes.editor.setComponents).not.toHaveBeenCalled();

    rerender({ html: "<p>two</p>", css: "", onDirtyChange: () => undefined });
    expect(grapes.editor.setComponents).toHaveBeenCalledWith("<p>two</p>");
  });

  it("does not reload when the host echoes serialized content back as props", async () => {
    grapes.editor.getHtml.mockReturnValue("<p>edited</p>");
    const { result, rerender } = mountHook({ html: "<p>one</p>", css: ".x{color:red}" });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    let serialized: { html: string; css: string } | null = null;
    act(() => { serialized = result.current.serialize(); });
    grapes.editor.setComponents.mockClear();

    rerender(serialized!);
    expect(grapes.editor.setComponents).not.toHaveBeenCalled();
  });

  it("destroys the editor on unmount", async () => {
    const { result, unmount } = mountHook({ html: "", css: "" });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    unmount();
    expect(grapes.editor.destroy).toHaveBeenCalled();
  });

  it("serializes sanitized content, and blocks unsafe content with an inline error", async () => {
    const { result } = mountHook({ html: "", css: "" });
    await waitFor(() => expect(result.current.editor).not.toBeNull());
    expect(result.current.serialize()).toEqual({ html: "<p>hello</p>", css: ".x{color:red}" });

    grapes.editor.getCss.mockReturnValue('@import url("https://evil.example/x.css");');
    let serialized: unknown = "unset";
    act(() => { serialized = result.current.serialize(); });
    expect(serialized).toBeNull();
    expect(result.current.error).toMatch(/disallowed content/i);
  });

  it("reports dirty on edits and exposes undo backed by the UndoManager", async () => {
    const onDirtyChange = vi.fn();
    const { result } = mountHook({ html: "", css: "", onDirtyChange });
    await waitFor(() => expect(result.current.editor).not.toBeNull());

    act(() => grapes.recordEdit());
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(result.current.canUndo).toBe(true);

    act(() => result.current.undo());
    expect(grapes.editor.UndoManager.undo).toHaveBeenCalled();
    expect(result.current.canUndo).toBe(false);
  });
});
