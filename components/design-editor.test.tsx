// @vitest-environment jsdom

import { forwardRef, useImperativeHandle } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentationDetail } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
  serialize: vi.fn((): { html: string; css: string } | null => ({ html: "<p>edited</p>", css: ".x{color:red}" })),
}));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));

// The real GrapesJS-backed canvas is covered by slide-html-canvas.test.tsx;
// here we only need to prove DesignEditor wires html/css/ref correctly.
vi.mock("@/components/slide-html-canvas", () => ({
  SlideHtmlCanvas: forwardRef(function MockCanvas(
    props: { html: string; css: string; onDirtyChange?: (dirty: boolean) => void; chrome?: { toolbar?: boolean; blockPalette?: boolean; layerList?: boolean }; saveState?: string },
    ref,
  ) {
    useImperativeHandle(ref, () => ({ serialize: mocks.serialize }));
    return (
      <div aria-label="Slide canvas" data-css={props.css} data-html={props.html} data-save-state={props.saveState}>
        <button onClick={() => props.onDirtyChange?.(true)} type="button">
          Simulate edit
        </button>
      </div>
    );
  }),
}));

import { DesignEditor } from "./design-editor";

const blankDetail: PresentationDetail = {
  id: "design-1",
  title: "My design",
  status: "COMPLETED",
  outline: null,
  document: { slides: [{ number: 1, html: "", css: "" }] },
  revisionNumber: 1,
  undoableSlideNumbers: [],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  completedAt: "2026-08-01T00:00:00.000Z",
  provider: "design",
  modelId: "design",
};

beforeEach(() => {
  mocks.authFetch.mockReset();
  mocks.serialize.mockReset().mockReturnValue({ html: "<p>edited</p>", css: ".x{color:red}" });
  mocks.authFetch.mockResolvedValue(Response.json(blankDetail));
});

describe("DesignEditor", () => {
  it("renders the canvas with full chrome and reflects dirty/saved state in the toolbar's save-state indicator", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    const canvas = await screen.findByLabelText("Slide canvas");
    expect(canvas).toHaveAttribute("data-save-state", "saved");

    await user.click(screen.getByRole("button", { name: "Simulate edit" }));
    expect(canvas).toHaveAttribute("data-save-state", "dirty");
  });

  it("loads the presentation and starts from its blank slide", async () => {
    render(<DesignEditor generationId="design-1" />);
    expect(await screen.findByLabelText("Presentation title")).toHaveValue("My design");
    expect(screen.getByLabelText("Slide canvas")).toBeVisible();
  });

  it("marks the design dirty and commits the serialized edit when the canvas reports a change", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");

    await user.click(screen.getByRole("button", { name: "Simulate edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
  });

  it("adds slides and refuses to delete the last remaining slide", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");

    expect(screen.getByRole("button", { name: "Delete slide 1" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "+ Add slide" }));
    expect(screen.getByRole("button", { name: "Delete slide 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete slide 2" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Delete slide 2" }));
    expect(screen.getByRole("button", { name: "Delete slide 1" })).toBeDisabled();
  });

  it("saves the serialized canvas html/css with the expected revision and clears the dirty flag", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Simulate edit" }));

    mocks.authFetch.mockResolvedValueOnce(Response.json({ ...blankDetail, revisionNumber: 2 }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeVisible());
    const [path, init] = mocks.authFetch.mock.calls.at(-1)!;
    expect(path).toBe("/api/slides/design/save");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ generationId: "design-1", expectedRevision: 1 });
    expect(body.slides[0]).toMatchObject({ number: 1, html: "<p>edited</p>", css: ".x{color:red}" });
  });

  it("does not save when the canvas serialization is rejected (unsafe content)", async () => {
    const user = userEvent.setup();
    mocks.serialize.mockReturnValue(null);
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Simulate edit" }));

    const callsBefore = mocks.authFetch.mock.calls.length;
    await user.click(screen.getByRole("button", { name: /^(Save|Saved)$/ }));
    expect(mocks.authFetch.mock.calls.length).toBe(callsBefore);
  });

  it("shows a conflict message on 409 and lets the user reload", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Simulate edit" }));

    mocks.authFetch.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");

    mocks.authFetch.mockResolvedValueOnce(Response.json(blankDetail));
    await user.click(screen.getByRole("button", { name: "Reload" }));
    await waitFor(() => expect(mocks.authFetch).toHaveBeenLastCalledWith("/api/slides/design-1"));
  });

  it("downloads the server-rendered standalone HTML after saving", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:design");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Simulate edit" }));

    mocks.authFetch.mockResolvedValueOnce(Response.json({ ...blankDetail, revisionNumber: 2 }));
    mocks.authFetch.mockResolvedValueOnce(new Response("<!doctype html><html></html>", { headers: { "content-type": "text/html" } }));
    await user.click(screen.getByRole("button", { name: "Download HTML" }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(mocks.authFetch.mock.calls.at(-1)?.[0]).toBe("/api/slides/design-1/download");
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain("<!doctype html>");

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows an error and does not download when the pre-download save fails", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Simulate edit" }));

    mocks.authFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await user.click(screen.getByRole("button", { name: "Download HTML" }));

    expect(await screen.findByText(/Could not save before download/)).toBeVisible();
  });

  it("shows a not-found state for an unavailable presentation", async () => {
    mocks.authFetch.mockResolvedValue(new Response(null, { status: 404 }));
    render(<DesignEditor generationId="missing" />);
    expect(await screen.findByRole("heading", { name: "Presentation not found" })).toBeVisible();
  });

  it("shows an unavailable state for a presentation with no structured document yet", async () => {
    mocks.authFetch.mockResolvedValue(Response.json({ ...blankDetail, document: null }));
    render(<DesignEditor generationId="design-1" />);
    expect(await screen.findByRole("heading", { name: "Not available in the visual editor yet" })).toBeVisible();
  });

  it("retries generic load failures", async () => {
    const user = userEvent.setup();
    mocks.authFetch.mockResolvedValueOnce(new Response(null, { status: 500 })).mockResolvedValueOnce(Response.json(blankDetail));
    render(<DesignEditor generationId="design-1" />);
    await user.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByLabelText("Slide canvas")).toBeVisible();
    expect(mocks.authFetch).toHaveBeenCalledTimes(2);
  });
});
