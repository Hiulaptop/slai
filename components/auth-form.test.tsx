// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  status: "anonymous" as "anonymous" | "authenticated",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams("next=%2Fslides%2Fnew"),
}));

vi.mock("@/lib/auth/auth-context", () => ({
  useAuth: () => ({
    status: mocks.status,
    user: mocks.status === "authenticated" ? { email: "user@example.com" } : null,
    login: mocks.login,
    register: mocks.register,
  }),
}));

beforeEach(() => {
  mocks.status = "anonymous";
  mocks.replace.mockReset();
  mocks.login.mockReset();
  mocks.register.mockReset();
});

describe("AuthForm", () => {
  it("does not submit invalid login values", async () => {
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "invalid");
    await userEvent.type(screen.getByLabelText("Password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Enter a valid email address.")).toBeVisible();
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("logs in and follows a safe next destination", async () => {
    mocks.login.mockResolvedValue(undefined);
    render(<AuthForm mode="login" />);
    await userEvent.type(screen.getByLabelText("Email"), "User@Example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "password123",
    }));
    expect(mocks.replace).toHaveBeenCalledWith("/slides/new");
  });

  it("announces registration failures and remains usable", async () => {
    mocks.register.mockRejectedValue(new Error("offline"));
    render(<AuthForm mode="register" />);
    await userEvent.type(screen.getByLabelText("Email"), "user@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Unable to register");
    expect(screen.getByRole("button", { name: "Register" })).toBeEnabled();
  });

  it("redirects an authenticated visitor", async () => {
    mocks.status = "authenticated";
    render(<AuthForm mode="login" />);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/home"));
  });
});
