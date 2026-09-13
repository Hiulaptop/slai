// @vitest-environment jsdom

import { createRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const grapes = vi.hoisted(() => {
  const wrapper = { components: () => ({ models: [] as unknown[] }), append: vi.fn() };
  const editor = {
    setComponents: vi.fn(),
    setStyle: vi.fn(),
    getHtml: vi.fn(() => "<p>hello</p>"),
    getCss: vi.fn(() => ".x{color:red}"),
    on: vi.fn(),
    destroy: vi.fn(),
    getWrapper: () => wrapper,
    getSelected: () => undefined,
    select: vi.fn(),
    UndoManager: { clear: vi.fn(), hasUndo: vi.fn(() => false), hasRedo: vi.fn(() => false), undo: vi.fn(), redo: vi.fn() },
  };
  return { editor, wrapper };
});

vi.mock("grapesjs", () => ({ default: { init: vi.fn(() => grapes.editor) } }));
vi.mock("grapesjs/dist/css/grapes.min.css", () => ({}));

import { SlideHtmlCanvas, type SlideHtmlCanvasHandle } from "./slide-html-canvas";

beforeEach(() => {
  vi.clearAllMocks();
  grapes.editor.getHtml.mockReturnValue("<p>hello</p>");
  grapes.editor.getCss.mockReturnValue(".x{color:red}");
  grapes.editor.UndoManager.hasUndo.mockReturnValue(false);
  grapes.editor.UndoManager.hasRedo.mockReturnValue(false);
});

describe("SlideHtmlCanvas", () => {
  it("renders the full chrome (toolbar, block palette, layer list) by default", async () => {
    render(<SlideHtmlCanvas css="" html="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByLabelText("Slide canvas")).toBeVisible());
    expect(screen.getByLabelText("Canvas toolbar")).toBeVisible();
    expect(screen.getByLabelText("Block palette")).toBeVisible();
    expect(screen.getByLabelText("Layers")).toBeVisible();
  });

  it("omits chrome pieces disabled via the chrome prop, while the canvas itself still works", async () => {
    render(<SlideHtmlCanvas chrome={{ toolbar: false, blockPalette: false, layerList: false }} css="" html="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByLabelText("Slide canvas")).toBeVisible());
    expect(screen.queryByLabelText("Canvas toolbar")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Block palette")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Layers")).not.toBeInTheDocument();
  });

  it("serializes sanitized html/css through the imperative handle", async () => {
    const ref = createRef<SlideHtmlCanvasHandle>();
    render(<SlideHtmlCanvas ref={ref} css=".x{color:red}" html="<p>hello</p>" />);
    await waitFor(() => expect(screen.getByLabelText("Slide canvas")).toBeVisible());
    expect(ref.current?.serialize()).toEqual({ html: "<p>hello</p>", css: ".x{color:red}" });
  });

  it("blocks the save and surfaces an inline error for unsafe authored html", async () => {
    grapes.editor.getHtml.mockReturnValue('<p onclick="x()">hi</p><script>x()</script>');
    grapes.editor.getCss.mockReturnValue('@import url("https://evil.example/x.css");');
    const ref = createRef<SlideHtmlCanvasHandle>();
    render(<SlideHtmlCanvas ref={ref} css="" html="<p>hi</p>" />);
    await waitFor(() => expect(screen.getByLabelText("Slide canvas")).toBeVisible());

    expect(ref.current?.serialize()).toBeNull();
    expect(await screen.findByRole("alert")).toHaveTextContent(/disallowed content/i);
  });

  it("notifies dirty state on component change events", async () => {
    const onDirtyChange = vi.fn();
    render(<SlideHtmlCanvas css="" html="<p>hi</p>" onDirtyChange={onDirtyChange} />);
    await waitFor(() => expect(grapes.editor.on).toHaveBeenCalled());
    const [events, handler] = grapes.editor.on.mock.calls.find((call: unknown[]) => (call[0] as string).includes("component:update")) as [string, () => void];
    expect(events).toContain("component:update");
    handler();
    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("shows a load-failure state when GrapesJS fails to initialize", async () => {
    const grapesjs = (await import("grapesjs")).default;
    vi.mocked(grapesjs.init).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    render(<SlideHtmlCanvas css="" html="" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be loaded");
  });
});
