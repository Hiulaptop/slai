// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PresentationDetail } from "@/lib/types";
import { SlideEditor } from "./slide-editor";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ authFetch: mocks.authFetch }),
}));

const html = `<!doctype html><html><head><style>body.presentation .deck .slai-slide{color:rgb(12,34,56)}</style><script>window.bad=true</script></head><body class="presentation"><main class="deck"><div class="slai-slide" data-slide-number="1"><h1>Provider secret one</h1></div><div class="slai-slide" data-slide-number="2"><h1>Provider secret two</h1></div></main></body></html>`;

const detail: PresentationDetail = {
  id: "generation-1",
  title: "Quarterly review",
  status: "COMPLETED",
  outline: { title: "Quarterly review", slides: [
    { number: 1, title: "Opening", summary: "Start" },
    { number: 2, title: "Results", summary: "Finish" },
  ] },
  html,
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
  it("downloads the current presentation HTML with a safe filename", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:presentation");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    render(<SlideEditor generationId="generation-1" />);

    await user.click(await screen.findByRole("button", { name: "Download HTML" }));

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/html;charset=utf-8");
    await expect(blob.text()).resolves.toContain('data-slide-number="1"');
    await expect(blob.text()).resolves.toContain('data-slide-number="2"');
    await expect(blob.text()).resolves.toContain('aria-label="Previous slide"');
    await expect(blob.text()).resolves.toContain('aria-label="Next slide"');
    await expect(blob.text()).resolves.toContain("event.key === 'ArrowLeft'");
    await expect(blob.text()).resolves.toContain("event.key === 'ArrowRight'");
    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("Quarterly-review.html");
    expect(anchor.href).toBe("blob:presentation");
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:presentation"));
    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("renders only the selected wrapper in a script-disabled iframe", async () => {
    render(<SlideEditor generationId="generation-1" />);

    const frame = await screen.findByTitle("Slide 1 preview");
    expect(frame).toHaveAttribute("sandbox", "allow-same-origin");
    expect(frame).not.toHaveAttribute("allow");
    expect(frame.getAttribute("srcdoc")).toContain("Provider secret one");
    expect(frame.getAttribute("srcdoc")).not.toContain("Provider secret two");
    expect(frame.getAttribute("srcdoc")).toContain('<body class="presentation">');
    expect(frame.getAttribute("srcdoc")).toContain('<main class="deck">');
    expect(frame.getAttribute("srcdoc")).toContain("body.presentation .deck .slai-slide{color:rgb(12,34,56)}");
    const rendered = new DOMParser().parseFromString(frame.getAttribute("srcdoc")!, "text/html");
    expect(rendered.querySelector("body.presentation .deck .slai-slide[data-slide-number='1']")).not.toBeNull();
    expect(frame.getAttribute("srcdoc")).not.toContain("<script");
    expect(frame.getAttribute("srcdoc")).toContain('data-slai-viewport="true"');
    expect(frame.getAttribute("srcdoc")).toContain("height:100%!important");
    expect(frame.getAttribute("srcdoc")).toContain("overflow:hidden!important");
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
    mocks.authFetch.mockResolvedValue(Response.json({ ...detail, status, html: null, revisionNumber: null }));
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
