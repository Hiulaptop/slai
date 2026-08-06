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
  html: null,
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
  it("loads the presentation and starts from a single blank slide when there is no saved HTML yet", async () => {
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

  it("saves the serialized document with the expected revision and clears the dirty flag", async () => {
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
    expect(body.html).toContain("data-slai-el-type=\"rectangle\"");
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

  it("falls back to exporting the current unsaved canvas when a pre-download save fails", async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn().mockReturnValue("blob:design");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    render(<DesignEditor generationId="design-1" />);
    await screen.findByLabelText("Slide canvas");
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    await clickCanvas();

    mocks.authFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await user.click(screen.getByRole("button", { name: "Download HTML" }));

    await waitFor(() => expect(click).toHaveBeenCalledOnce());
    expect(await screen.findByText(/downloading your current unsaved changes instead/)).toBeVisible();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    await expect(blob.text()).resolves.toContain("data-slai-el-type=\"rectangle\"");

    click.mockRestore();
    vi.unstubAllGlobals();
  });

  it("shows a not-found state for an unavailable presentation", async () => {
    mocks.authFetch.mockResolvedValue(new Response(null, { status: 404 }));
    render(<DesignEditor generationId="missing" />);
    expect(await screen.findByRole("heading", { name: "Presentation not found" })).toBeVisible();
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
