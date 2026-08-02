// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import NewPresentationPage from "./page";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

function outline(count = 2) {
  return {
    title: "Market outlook",
    slides: Array.from({ length: count }, (_, index) => ({ number: index + 1, title: `Slide ${index + 1}`, summary: `Summary ${index + 1}` })),
  };
}

function files() {
  return {
    reports: [new File(["first"], "research.txt", { type: "text/plain" }), new File(["second"], "metrics.md", { type: "text/markdown" })],
    templates: [new File(["<html>"], "brand.html", { type: "text/html" }), new File(["%PDF"], "reference.pdf", { type: "application/pdf" })],
  };
}

async function completeInputs(slideCount = "2") {
  const user = userEvent.setup();
  const selected = files();
  await user.type(screen.getByLabelText("Presentation title"), "Market review");
  await user.type(screen.getByLabelText("Number of slides"), slideCount);
  await user.type(screen.getByLabelText("What should the presentation accomplish?"), "Explain the market changes.");
  await user.upload(screen.getByLabelText("Data files"), selected.reports);
  await user.upload(screen.getByLabelText("Template files"), selected.templates);
  return { user, selected };
}

describe("NewPresentationPage", () => {
  beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.push.mockReset();
  });

  it("shows field errors and has no arbitrary slide-count maximum", async () => {
    const user = userEvent.setup();
    render(<NewPresentationPage />);
    const count = screen.getByLabelText("Number of slides");

    expect(count).not.toHaveAttribute("max");
    await user.click(screen.getByRole("button", { name: "Review outline" }));

    expect(screen.getByText("Enter a presentation title.")).toBeVisible();
    expect(screen.getByText("Enter a positive whole number of slides.")).toBeVisible();
    expect(screen.getByText("Add at least one data file.")).toBeVisible();
    expect(mocks.authFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Back to presentations" })).toHaveAttribute("href", "/home");
  });

  it("lists multiple files, removes individual files, and rejects invalid files", async () => {
    render(<NewPresentationPage />);
    const { user, selected } = await completeInputs();

    expect(within(screen.getByRole("list", { name: "Selected data files" })).getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove research.txt" }));
    expect(screen.queryByText(/research\.txt/)).not.toBeInTheDocument();
    expect(screen.getByText(/metrics\.md/)).toBeVisible();

    const oversized = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    await user.upload(screen.getByLabelText("Data files"), oversized);
    expect(screen.getByText(/huge\.pdf must be a supported/)).toBeVisible();
    expect(selected.templates).toHaveLength(2);
  });

  it("accepts counts above 50 and sends all outline multipart fields with retry", async () => {
    mocks.authFetch
      .mockResolvedValueOnce(Response.json({ error: { message: "Provider is busy" } }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ outline: outline(51) }));
    render(<NewPresentationPage />);
    const { user } = await completeInputs("51");

    await user.click(screen.getByRole("button", { name: "Review outline" }));
    expect(await screen.findByText("Provider is busy")).toBeVisible();
    expect(screen.getByDisplayValue("Market review")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Retry outline" }));

    expect(await screen.findByRole("heading", { name: "Shape the narrative" })).toBeVisible();
    expect(screen.getByLabelText("Slide 51 title")).toHaveValue("Slide 51");
    const request = mocks.authFetch.mock.calls[1][1] as RequestInit;
    const body = request.body as FormData;
    expect(mocks.authFetch.mock.calls[1][0]).toBe("/api/slides/outline");
    expect(body.get("slideCount")).toBe("51");
    expect(body.getAll("dataFiles")).toHaveLength(2);
    expect(body.getAll("templateFiles")).toHaveLength(0);
  });

  it("preserves files across phases and submits edited outline before navigating", async () => {
    mocks.authFetch
      .mockResolvedValueOnce(Response.json({ outline: outline() }))
      .mockResolvedValueOnce(Response.json({ outline: outline() }))
      .mockResolvedValueOnce(Response.json({ error: { message: "Generation timed out" } }, { status: 502 }))
      .mockResolvedValueOnce(Response.json({ id: "deck-123" }, { status: 201 }));
    render(<NewPresentationPage />);
    const { user } = await completeInputs();

    await user.click(screen.getByRole("button", { name: "Review outline" }));
    await screen.findByRole("heading", { name: "Shape the narrative" });
    await user.clear(screen.getByLabelText("Slide 1 title"));
    await user.type(screen.getByLabelText("Slide 1 title"), "Edited opening");
    await user.click(screen.getByRole("button", { name: "Back to inputs" }));
    expect(screen.getByText(/research\.txt/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Review outline" }));

    await screen.findByRole("heading", { name: "Shape the narrative" });
    await user.clear(screen.getByLabelText("Slide 1 title"));
    await user.type(screen.getByLabelText("Slide 1 title"), "Edited opening");
    await user.click(screen.getByRole("button", { name: "Generate presentation" }));

    expect(await screen.findByText("Generation timed out")).toBeVisible();
    expect(screen.getByLabelText("Slide 1 title")).toHaveValue("Edited opening");
    await user.click(screen.getByRole("button", { name: "Retry generation" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/slides/deck-123"));
    const request = mocks.authFetch.mock.calls.at(-1)?.[1] as RequestInit;
    const body = request.body as FormData;
    expect(mocks.authFetch.mock.calls.at(-1)?.[0]).toBe("/api/slides/generate");
    expect(body.getAll("dataFiles")).toHaveLength(2);
    expect(body.getAll("templateFiles")).toHaveLength(2);
    expect((body.getAll("templateFiles")[1] as File).type).toBe("application/pdf");
    expect(JSON.parse(String(body.get("outline"))).slides[0].title).toBe("Edited opening");
  });
});
