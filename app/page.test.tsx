// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LandingPage from "./page";

describe("LandingPage", () => {
  it("offers only the essential authentication actions", () => {
    render(<LandingPage />);

    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Register" })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("main")).toHaveClass("min-h-dvh");
  });
});
