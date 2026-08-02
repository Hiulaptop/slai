import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthClient, resetAuthClientForTests, safeNextPath } from "./auth-client";

const user = {
  id: "user-1",
  email: "user@example.com",
  status: "ACTIVE" as const,
  lastLoginAt: null,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetAuthClientForTests();
});

describe("AuthClient", () => {
  it("deduplicates concurrent bootstrap refreshes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ accessToken: "token" }))
      .mockResolvedValueOnce(Response.json({ user }));
    vi.stubGlobal("fetch", fetchMock);

    const first = new AuthClient();
    const second = new AuthClient();
    await Promise.all([first.bootstrap(), second.bootstrap()]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.getSnapshot().status).toBe("authenticated");
    expect(second.getSnapshot().status).toBe("authenticated");
  });

  it("refreshes and retries a protected request only once", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ accessToken: "replacement" }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await new AuthClient().authFetch("/api/slides");

    expect(response.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(new Headers(fetchMock.mock.calls[2][1].headers).get("Authorization"))
      .toBe("Bearer replacement");
  });

  it("clears local state even when logout fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const client = new AuthClient();

    await expect(client.logout()).rejects.toThrow("offline");
    expect(client.getSnapshot().status).toBe("anonymous");
  });
});

describe("safeNextPath", () => {
  it("accepts only same-origin absolute paths", () => {
    expect(safeNextPath("/slides/new")).toBe("/slides/new");
    expect(safeNextPath("//example.com")).toBe("/home");
    expect(safeNextPath("https://example.com")).toBe("/home");
  });
});
