// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PresentationDashboard } from "./presentation-dashboard";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({ authFetch: mocks.authFetch }),
}));

const presentation = {
  id: "presentation-1",
  title: "Quarterly review",
  status: "COMPLETED" as const,
  currentRevisionNumber: 2,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
  completedAt: "2026-08-02T00:00:00.000Z",
};

beforeEach(() => mocks.authFetch.mockReset());

describe("PresentationDashboard", () => {
  it("shows a large create action for an empty library", async () => {
    mocks.authFetch.mockResolvedValue(Response.json({ items: [], nextCursor: null }));
    render(<PresentationDashboard />);

    expect(screen.getByLabelText("Loading presentations")).toBeVisible();
    expect(await screen.findByRole("link", { name: "Create presentation" })).toHaveAttribute("href", "/slides/new");
  });

  it("shows cards and the corner create action for a populated library", async () => {
    mocks.authFetch.mockResolvedValue(Response.json({ items: [presentation], nextCursor: null }));
    render(<PresentationDashboard />);

    expect(await screen.findByText("Quarterly review")).toBeVisible();
    expect(screen.getByText("Completed")).toBeVisible();
    expect(screen.getByText("Revision 2")).toBeVisible();
    expect(screen.getByRole("time")).toHaveAttribute("datetime", presentation.updatedAt);
    expect(screen.getByRole("link", { name: /Quarterly review/ })).toHaveAttribute("href", "/slides/presentation-1");
    expect(screen.getByRole("link", { name: /Create$/ })).toHaveClass("fixed");
  });

  it("links non-completed presentations to their detail state", async () => {
    mocks.authFetch.mockResolvedValue(Response.json({
      items: [{ ...presentation, id: "pending-1", title: "Working deck", status: "PROCESSING", currentRevisionNumber: null }],
      nextCursor: null,
    }));
    render(<PresentationDashboard />);

    expect(await screen.findByRole("link", { name: /Working deck/ })).toHaveAttribute("href", "/slides/pending-1");
    expect(screen.getByText("Processing")).toBeVisible();
    expect(screen.getByText("Revision -")).toBeVisible();
  });

  it("retries an initial failure", async () => {
    mocks.authFetch
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ items: [], nextCursor: null }));
    render(<PresentationDashboard />);

    expect(await screen.findByRole("link", { name: "Create presentation" })).toHaveAttribute("href", "/slides/new");
    await userEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("link", { name: "Create presentation" })).toBeVisible();
    expect(mocks.authFetch).toHaveBeenCalledTimes(2);
  });

  it("appends cursor pages and preserves cards after a later failure", async () => {
    mocks.authFetch
      .mockResolvedValueOnce(Response.json({ items: [presentation], nextCursor: "cursor-1" }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    render(<PresentationDashboard />);

    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("More presentations could not be loaded.")).toBeVisible();
    expect(screen.getByText("Quarterly review")).toBeVisible();
    expect(mocks.authFetch.mock.calls[1][0]).toContain("cursor=cursor-1");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry load more" })).toBeEnabled());
  });
});
