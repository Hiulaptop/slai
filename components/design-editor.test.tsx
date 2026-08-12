// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentationDetail } from "@/lib/types";
import { DesignEditor } from "./design-editor";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));

const blankDetail: PresentationDetail = {
  id: "design-1",
  title: "My design",
  status: "COMPLETED",
  outline: null,
  document: { animationRegistryVersion: 1, slides: [{ number: 1, width: 960, height: 540, props: {}, elements: [] }] },
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
  mocks.authFetch.mockResolvedValue(Response.json(blankDetail));
});

async function clickCanvas() {
  const canvas = await screen.findByLabelText("Slide canvas");
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 60, pointerId: 1 });
}

describe("DesignEditor", () => {
  it("loads the presentation and starts from its blank slide", async () => {
    render(<DesignEditor generationId="design-1" />);
    expect(await screen.findByLabelText("Presentation title")).toHaveValue("My design");
    expect(screen.getByLabelText("Slide canvas")).toBeVisible();
    expect(screen.getByText("0 elements")).toBeVisible();
  });

  it("creates an element with the active tool and selects it", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");

    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();

    expect(screen.getByText("1 element")).toBeVisible();
    expect(screen.getByRole("button", { name: "Bring forward" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send backward" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Properties" })).toBeVisible();
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

  it("creates a table with pre-populated cells", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");

    await user.click(screen.getByRole("button", { name: "Table" }));
    await clickCanvas();

    expect(screen.getByText("1 element")).toBeVisible();
    expect(screen.getByLabelText("Edit cell row 1 column 1")).toBeVisible();
    expect(screen.getByLabelText("Edit cell row 2 column 2")).toBeVisible();
  });

  it("edits a table cell's text content through the properties panel", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Table" }));
    await clickCanvas();

    await user.click(screen.getByLabelText("Edit cell row 1 column 1"));
    const cellInput = await screen.findByLabelText(/Cell text \(row 1, column 1\)/);
    await user.type(cellInput, "Revenue");
    expect(cellInput).toHaveValue("Revenue");
  });

  it("saves the structured document with the expected revision and clears the dirty flag", async () => {
    const user = userEvent.setup();
    mocks.authFetch.mockResolvedValueOnce(Response.json(blankDetail));
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");

    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();

    mocks.authFetch.mockResolvedValueOnce(Response.json({ ...blankDetail, revisionNumber: 2 }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeVisible());
    const [path, init] = mocks.authFetch.mock.calls.at(-1)!;
    expect(path).toBe("/api/slides/design/save");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ generationId: "design-1", expectedRevision: 1 });
    expect(body.slides[0].elements[0]).toMatchObject({ type: "shape", props: { shapeType: "rectangle" } });
  });

  it("shows a conflict message on 409 and lets the user reload", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();

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
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();

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
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();

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

  it("updates the canvas live preview via CSS custom property while dragging the font-size slider, without committing or touching the network until release", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Text" }));
    await clickCanvas();

    const slider = screen.getByLabelText(/Font size/);
    const canvasNode = document.querySelector<HTMLElement>("[data-slai-element-id]");
    expect(canvasNode).not.toBeNull();
    expect(canvasNode!.style.getPropertyValue("--slai-font-size")).toBe("18px");

    const callsBeforeDrag = mocks.authFetch.mock.calls.length;
    fireEvent.change(slider, { target: { value: "90" } });

    expect(canvasNode!.style.getPropertyValue("--slai-font-size")).toBe("90px");
    expect(mocks.authFetch.mock.calls.length).toBe(callsBeforeDrag);

    mocks.authFetch.mockResolvedValueOnce(Response.json({ ...blankDetail, revisionNumber: 2 }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeVisible());
    const [, init] = mocks.authFetch.mock.calls.at(-1)!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.slides[0].elements[0].props.fontSize).toBe(18);
  });

  it("commits the dragged font-size value on release, matching what gets sent to save", async () => {
    const user = userEvent.setup();
    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Text" }));
    await clickCanvas();

    const slider = screen.getByLabelText(/Font size/);
    fireEvent.change(slider, { target: { value: "90" } });
    fireEvent.pointerUp(slider);

    mocks.authFetch.mockResolvedValueOnce(Response.json({ ...blankDetail, revisionNumber: 2 }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved" })).toBeVisible());
    const [, init] = mocks.authFetch.mock.calls.at(-1)!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.slides[0].elements[0].props.fontSize).toBe(90);
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
