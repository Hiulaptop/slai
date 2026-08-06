// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DesignProjectSetup } from "./design-project-setup";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), push: vi.fn(), onBack: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("DesignProjectSetup", () => {
  beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.push.mockReset();
    mocks.onBack.mockReset();
  });

  it("defaults to blank mode with a slide count field and validates a missing title", async () => {
    const user = userEvent.setup();
    render(<DesignProjectSetup onBack={mocks.onBack} />);

    expect(screen.getByLabelText("Number of slides")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Open design editor" }));
    expect(screen.getByText("Enter a project title.")).toBeVisible();
    expect(mocks.authFetch).not.toHaveBeenCalled();
  });

  it("submits a blank bootstrap request and navigates to the design editor on success", async () => {
    mocks.authFetch.mockResolvedValueOnce(Response.json({ id: "proj-1" }, { status: 201 }));
    const user = userEvent.setup();
    render(<DesignProjectSetup onBack={mocks.onBack} />);

    await user.type(screen.getByLabelText("Project title"), "Board deck");
    await user.clear(screen.getByLabelText("Number of slides"));
    await user.type(screen.getByLabelText("Number of slides"), "5");
    await user.click(screen.getByRole("button", { name: "Open design editor" }));

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/slides/proj-1/design"));
    const [path, init] = mocks.authFetch.mock.calls[0];
    expect(path).toBe("/api/slides/design/bootstrap");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: "Board deck", mode: "blank", slideCount: 5 });
  });

  it("loads owned templates when switching to template mode and requires a selection", async () => {
    mocks.authFetch.mockResolvedValueOnce(
      Response.json({ items: [{ id: "tpl-1", name: "Quarterly review" }] }),
    );
    const user = userEvent.setup();
    render(<DesignProjectSetup onBack={mocks.onBack} />);

    await user.click(screen.getByRole("radio", { name: /From a template/ }));
    expect(await screen.findByRole("button", { name: "Quarterly review" })).toBeVisible();

    await user.type(screen.getByLabelText("Project title"), "Board deck");
    await user.click(screen.getByRole("button", { name: "Open design editor" }));
    expect(screen.getByText("Choose a template.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Quarterly review" }));
    mocks.authFetch.mockResolvedValueOnce(Response.json({ id: "proj-2" }, { status: 201 }));
    await user.click(screen.getByRole("button", { name: "Open design editor" }));

    const [, init] = mocks.authFetch.mock.calls.at(-1)!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ title: "Board deck", mode: "template", templateId: "tpl-1" });
  });

  it("shows the request error and offers retry on bootstrap failure", async () => {
    mocks.authFetch.mockResolvedValueOnce(Response.json({ error: { message: "Bootstrap is not available yet." } }, { status: 404 }));
    const user = userEvent.setup();
    render(<DesignProjectSetup onBack={mocks.onBack} />);

    await user.type(screen.getByLabelText("Project title"), "Board deck");
    await user.click(screen.getByRole("button", { name: "Open design editor" }));

    expect(await screen.findByText("Bootstrap is not available yet.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("calls onBack when Back is clicked", async () => {
    const user = userEvent.setup();
    render(<DesignProjectSetup onBack={mocks.onBack} />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(mocks.onBack).toHaveBeenCalled();
  });
});
