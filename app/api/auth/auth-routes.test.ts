import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/modules/auth/domain/auth.errors";

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  authenticate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/infrastructure/auth", () => ({
  authService: mocks,
}));

import { POST as login } from "./login/route";
import { POST as logout } from "./logout/route";
import { GET as me } from "./me/route";
import { POST as refresh } from "./refresh/route";
import { POST as register } from "./register/route";

const user = {
  id: "user-1",
  email: "user@example.com",
  status: "ACTIVE",
  lastLoginAt: null,
  createdAt: new Date("2026-08-02T00:00:00.000Z"),
  updatedAt: new Date("2026-08-02T00:00:00.000Z"),
};

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.register.mockResolvedValue({
      user,
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mocks.login.mockResolvedValue({
      user,
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    mocks.refresh.mockResolvedValue({
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
    mocks.logout.mockResolvedValue(undefined);
    mocks.authenticate.mockResolvedValue(user);
  });

  it("registers with a sanitized response and secure refresh cookie", async () => {
    const response = await register(
      jsonRequest("/api/auth/register", {
        email: " User@Example.com ",
        password: "password",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ user: { id: user.id }, accessToken: "access-token" });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|refreshTokenHash|refresh-token/);
    expect(response.headers.get("set-cookie")).toContain(
      "slai_refresh_token=refresh-token",
    );
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("maps invalid login input to status 400", async () => {
    const response = await login(
      jsonRequest("/api/auth/login", { email: "invalid", password: "short" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.login).not.toHaveBeenCalled();
  });

  it("maps generic login failures to status 401", async () => {
    mocks.login.mockRejectedValueOnce(
      new AuthError("INVALID_CREDENTIALS", "Invalid credentials"),
    );
    const response = await login(
      jsonRequest("/api/auth/login", {
        email: "user@example.com",
        password: "password",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials" },
    });
  });

  it("rotates refresh cookies and clears invalid ones", async () => {
    const request = new NextRequest("http://localhost/api/auth/refresh", {
      method: "POST",
      headers: { cookie: "slai_refresh_token=old-token" },
    });
    const success = await refresh(request);

    expect(success.status).toBe(200);
    expect(mocks.refresh).toHaveBeenCalledWith("old-token");
    expect(success.headers.get("set-cookie")).toContain("new-refresh-token");

    mocks.refresh.mockRejectedValueOnce(new AuthError("UNAUTHORIZED", "Unauthorized"));
    const failure = await refresh(request);
    expect(failure.status).toBe(401);
    expect(failure.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("keeps logout idempotent and always clears the cookie", async () => {
    mocks.logout.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await logout(
      new NextRequest("http://localhost/api/auth/logout", { method: "POST" }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("returns the current sanitized user or status 401", async () => {
    const request = new Request("http://localhost/api/auth/me", {
      headers: { Authorization: "Bearer token" },
    });
    const success = await me(request);

    expect(success.status).toBe(200);
    expect(JSON.stringify(await success.json())).not.toMatch(
      /passwordHash|refreshTokenHash/,
    );

    mocks.authenticate.mockRejectedValueOnce(
      new AuthError("UNAUTHORIZED", "Unauthorized"),
    );
    expect((await me(request)).status).toBe(401);
  });
});
