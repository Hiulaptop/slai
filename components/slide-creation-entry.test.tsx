// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SlideCreationEntry } from "./slide-creation-entry";

const mocks = vi.hoisted(() => ({ authFetch: vi.fn(), push: vi.fn() }));

vi.mock("@/lib/auth/auth-context", () => ({ useAuth: () => ({ authFetch: mocks.authFetch }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));

describe("SlideCreationEntry", () => {
  beforeEach(() => {
    mocks.authFetch.mockReset();
    mocks.push.mockReset();
  });

  it("shows the path chooser by default with both entry points", () => {
    render(<SlideCreationEntry />);
    expect(screen.getByRole("heading", { name: "How do you want to start?" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Start designing/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Start from a report/ })).toBeVisible();
  });

  it("opens the report creation workspace when chosen", async () => {
    const user = userEvent.setup();
    render(<SlideCreationEntry />);
    await user.click(screen.getByRole("button", { name: /Start from a report/ }));
    expect(screen.getByLabelText("Presentation title")).toBeVisible();
  });

  it("opens the design project setup when chosen, and Back returns to the chooser", async () => {
    mocks.authFetch.mockResolvedValue(Response.json({ items: [] }));
    const user = userEvent.setup();
    render(<SlideCreationEntry />);
    await user.click(screen.getByRole("button", { name: /Start designing/ }));
    expect(screen.getByLabelText("Project title")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "How do you want to start?" })).toBeVisible();
  });
});
