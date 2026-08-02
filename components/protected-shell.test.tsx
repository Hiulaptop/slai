// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProtectedShell } from "./protected-shell";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  status: "anonymous" as "anonymous" | "authenticated",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/slides/new",
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: mocks.status,
    user: mocks.status === "authenticated" ? {
      id: "user-1", email: "user@example.com", status: "ACTIVE",
      lastLoginAt: null, createdAt: "", updatedAt: "",
    } : null,
    logout: vi.fn(),
  }),
}));

beforeEach(() => {
  mocks.status = "anonymous";
  mocks.replace.mockReset();
});

describe("ProtectedShell", () => {
  it("hides content and redirects anonymous users with the intended path", async () => {
    render(<ProtectedShell><p>Private content</p></ProtectedShell>);
    expect(screen.queryByText("Private content")).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login?next=%2Fslides%2Fnew"));
  });

  it("renders the navbar and content for authenticated users", () => {
    mocks.status = "authenticated";
    render(<ProtectedShell><p>Private content</p></ProtectedShell>);
    expect(screen.getByText("Private content")).toBeVisible();
    expect(screen.getByText("user@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Logout" })).toBeVisible();
  });
});
