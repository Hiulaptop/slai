// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ElementNode, PresentationDetail } from "@/lib/types";
import { SlideEditor } from "./slide-editor";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ authFetch: mocks.authFetch }),
}));

function textElement(id: string, text: string): ElementNode {
  return {
    id,
    type: "text",
    schemaVersion: 1,
    geometry: { x: 0, y: 0, width: 400, height: 80, zIndex: 0 },
    props: { text, styleType: "body", fontSize: 18, fontWeight: 400, color: "#171713", backgroundColor: null, align: "left", bold: false, italic: false, underline: false, list: "none" },
    animation: null,
    children: [],
  };
}

const detail: PresentationDetail = {
  id: "generation-1",
  title: "Quarterly review",
  status: "COMPLETED",
  outline: { title: "Quarterly review", slides: [
    { number: 1, title: "Opening", summary: "Start" },
    { number: 2, title: "Results", summary: "Finish" },
  ] },
  document: {
    animationRegistryVersion: 1,
    slides: [
      { number: 1, width: 960, height: 540, props: {}, elements: [textElement("t1", "Provider secret one")] },
      { number: 2, width: 960, height: 540, props: {}, elements: [textElement("t2", "Provider secret two")] },
    ],
  },
  revisionNumber: 2,
  undoableSlideNumbers: [1],
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  completedAt: "2026-08-02T00:00:00.000Z",
  provider: "test",
  modelId: "test-model",
};

beforeEach(() => {
  mocks.authFetch.mockReset();
  mocks.authFetch.mockResolvedValue(Response.json(detail));
});

describe("SlideEditor", () => {
  it("downloads the server-rendered presentation HTML with a safe filename", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:presentation");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    render(<SlideEditor generationId="generation-1" />);
    await screen.findByTitle("Slide 1 preview");

    mocks.authFetch.mockResolvedValueOnce(new Response("<!doctype html><html><body>rendered deck</body></html>", { headers: { "content-type": "text/html" } }));
    await user.click(screen.getByRole("button", { name: "Download HTML" }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(mocks.authFetch.mock.calls.at(-1)?.[0]).toBe("/api/slides/generation-1/download");
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/html;charset=utf-8");
    await expect(blob.text()).resolves.toContain("rendered deck");
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("Quarterly-review.html");
    expect(anchor.href).toBe("blob:presentation");
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:presentation"));
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("renders only the selected slide's content in a script-disabled iframe", async () => {
    render(<SlideEditor generationId="generation-1" />);

    const frame = await screen.findByTitle("Slide 1 preview");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame).not.toHaveAttribute("allow");
    expect(frame.getAttribute("srcdoc")).toContain("Provider secret one");
    expect(frame.getAttribute("srcdoc")).not.toContain("Provider secret two");
    expect(frame.getAttribute("srcdoc")).toContain("<!doctype html>");
    expect(screen.queryByText("Provider secret one")).not.toBeInTheDocument();
  });

  it("navigates with buttons and thumbnails while preserving per-slide drafts", async () => {
    const user = userEvent.setup();
    render(<SlideEditor generationId="generation-1" />);
    const feedback = await screen.findByLabelText("Feedback for slide 1");
    await user.type(feedback, "Make the opening bolder");
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Feedback for slide 2")).toHaveValue("");
    await user.type(screen.getByLabelText("Feedback for slide 2"), "Add a chart");
    await user.click(screen.getByRole("button", { name: "Select slide 1" }));
    expect(screen.getByLabelText("Feedback for slide 1")).toHaveValue("Make the opening bolder");
    expect(screen.getByText("Slide 1 of 2 · Revision 2")).toBeVisible();
  });

  it("uses ArrowLeft for previous and ArrowRight for next slide", async () => {
    const user = userEvent.setup();
    render(<SlideEditor generationId="generation-1" />);
    await screen.findByTitle("Slide 1 preview");

    await user.keyboard("{ArrowRight}");
    expect(screen.getByTitle("Slide 2 preview")).toBeVisible();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByTitle("Slide 1 preview")).toBeVisible();
  });

  it("does not steal arrow keys from feedback input", async () => {
    const user = userEvent.setup();
    render(<SlideEditor generationId="generation-1" />);
    const feedback = await screen.findByLabelText("Feedback for slide 1");
    await user.click(feedback);
    await user.keyboard("{ArrowRight}");
    expect(screen.getByTitle("Slide 1 preview")).toBeVisible();
  });

  it("submits all trimmed drafts in one batch and clears submitted drafts after success", async () => {
    const user = userEvent.setup();
    mocks.authFetch
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(Response.json({ ...detail, revisionNumber: 3, undoableSlideNumbers: [1, 2] }));
    render(<SlideEditor generationId="generation-1" />);
    await user.type(await screen.findByLabelText("Feedback for slide 1"), "  Clarify opening  ");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.type(screen.getByLabelText("Feedback for slide 2"), "Add chart");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() => expect(mocks.authFetch).toHaveBeenCalledTimes(2));
    expect(mocks.authFetch.mock.calls[1]).toEqual(["/api/slides/edit", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ generationId: "generation-1", edits: [
        { slideNumber: 1, prompt: "Clarify opening" },
        { slideNumber: 2, prompt: "Add chart" },
      ] }),
    })]);
    expect(await screen.findByText("Slide 2 of 2 · Revision 3")).toBeVisible();
    expect(screen.getByLabelText("Feedback for slide 2")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByLabelText("Feedback for slide 1")).toHaveValue("");
  });

  it("rejects an empty batch without a request", async () => {
    const user = userEvent.setup();
    render(<SlideEditor generationId="generation-1" />);
    await screen.findByTitle("Slide 1 preview");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter feedback for at least one slide.");
    expect(mocks.authFetch).toHaveBeenCalledTimes(1);
  });

  it("preserves the current slide and drafts when batch editing fails", async () => {
    const user = userEvent.setup();
    mocks.authFetch
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(Response.json({ error: { message: "Provider unavailable" } }, { status: 502 }));
    render(<SlideEditor generationId="generation-1" />);
    await user.type(await screen.findByLabelText("Feedback for slide 1"), "Keep this draft");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Provider unavailable");
    expect(screen.getByLabelText("Feedback for slide 1")).toHaveValue("Keep this draft");
    expect(screen.getByTitle("Slide 1 preview").getAttribute("srcdoc")).toContain("Provider secret one");
    expect(screen.getByText("Slide 1 of 2 · Revision 2")).toBeVisible();
  });

  it("uses per-slide undo availability and preserves feedback through undo", async () => {
    const user = userEvent.setup();
    mocks.authFetch
      .mockResolvedValueOnce(Response.json(detail))
      .mockResolvedValueOnce(Response.json({ ...detail, revisionNumber: 3, undoableSlideNumbers: [] }));
    render(<SlideEditor generationId="generation-1" />);
    await user.type(await screen.findByLabelText("Feedback for slide 1"), "Unsaved feedback");
    await user.click(screen.getByRole("button", { name: "Undo slide" }));

    await waitFor(() => expect(mocks.authFetch).toHaveBeenCalledTimes(2));
    expect(mocks.authFetch.mock.calls[1]).toEqual(["/api/slides/generation-1/undo", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ slideNumber: 1 }),
    })]);
    expect(await screen.findByText("Slide 1 of 2 · Revision 3")).toBeVisible();
    expect(screen.getByLabelText("Feedback for slide 1")).toHaveValue("Unsaved feedback");
    expect(screen.getByRole("button", { name: "Undo slide" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("button", { name: "Undo slide" })).toBeDisabled();
  });

  it.each([
    ["PENDING", "Presentation is still being generated"],
    ["PROCESSING", "Presentation is still being generated"],
    ["FAILED", "Generation failed"],
  ] as const)("shows the %s lifecycle state without an iframe", async (status, heading) => {
    mocks.authFetch.mockResolvedValue(Response.json({ ...detail, status, document: null, revisionNumber: null }));
    render(<SlideEditor generationId="generation-1" />);
    expect(await screen.findByRole("heading", { name: heading })).toBeVisible();
    expect(screen.queryByTitle(/preview/)).not.toBeInTheDocument();
  });

  it("shows a private not-found state", async () => {
    mocks.authFetch.mockResolvedValue(new Response(null, { status: 404 }));
    render(<SlideEditor generationId="missing" />);
    expect(await screen.findByRole("heading", { name: "Presentation not found" })).toBeVisible();
    expect(screen.getByText(/unavailable or you do not have access/)).toBeVisible();
  });

  it("retries generic detail failures", async () => {
    const user = userEvent.setup();
    mocks.authFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json(detail));
    render(<SlideEditor generationId="generation-1" />);
    const state = await screen.findByRole("heading", { name: "Presentation unavailable" });
    await user.click(within(state.parentElement!).getByRole("button", { name: "Retry" }));
    expect(await screen.findByTitle("Slide 1 preview")).toBeVisible();
    expect(mocks.authFetch).toHaveBeenCalledTimes(2);
  });
});
