import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "../domain/auth.errors";
import type { AuthRepository } from "./auth.ports";
import { AuthService } from "./auth.service";

const now = new Date("2026-08-02T00:00:00.000Z");
const user = {
  id: "user-1",
  email: "user@example.com",
  passwordHash: "hash",
  status: "ACTIVE" as const,
  lastLoginAt: null,
  createdAt: now,
  updatedAt: now,
};
const authUser = {
  id: user.id,
  email: user.email,
  status: user.status,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};
const session = {
  id: "session-1",
  userId: user.id,
  refreshTokenHash: "refresh-hash",
  expiresAt: new Date("2026-09-01T00:00:00.000Z"),
  revokedAt: null,
};

function createRepository(): AuthRepository {
  return {
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(authUser),
    createUserWithSession: vi
      .fn()
      .mockResolvedValue({ user: authUser, session }),
    createSession: vi.fn().mockResolvedValue(session),
    updateLastLogin: vi.fn().mockResolvedValue(authUser),
    rotateSession: vi.fn().mockResolvedValue({ user: authUser, session }),
    revokeSession: vi.fn().mockResolvedValue(undefined),
  };
}

describe("AuthService", () => {
  let repository: AuthRepository;
  let service: AuthService;
  const passwords = {
    hash: vi.fn().mockResolvedValue("hash"),
    verify: vi.fn().mockResolvedValue(true),
  };
  const accessTokens = {
    sign: vi.fn().mockResolvedValue("access-token"),
    verify: vi.fn().mockResolvedValue({ userId: user.id, sessionId: session.id }),
  };
  const refreshTokens = {
    generate: vi.fn().mockReturnValue("refresh-token"),
    hash: vi.fn((token: string) => `${token}-hash`),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createRepository();
    service = new AuthService(repository, passwords, accessTokens, refreshTokens);
  });

  it("registers a user with hashed credentials and a session", async () => {
    await expect(
      service.register(
        { email: "user@example.com", password: "password" },
        { ipAddress: "127.0.0.1" },
      ),
    ).resolves.toEqual({
      user: authUser,
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(repository.createUserWithSession).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        passwordHash: "hash",
        refreshTokenHash: "refresh-token-hash",
      }),
    );
  });

  it("returns the same login failure for missing, incorrect, and disabled users", async () => {
    const credentials = { email: "user@example.com", password: "password" };

    await expect(service.login(credentials, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    vi.mocked(repository.findUserByEmail).mockResolvedValue(user);
    passwords.verify.mockResolvedValueOnce(false);
    await expect(service.login(credentials, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    vi.mocked(repository.findUserByEmail).mockResolvedValue({
      ...user,
      status: "DISABLED",
    });
    await expect(service.login(credentials, {})).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("rotates a refresh token and rejects reuse", async () => {
    await expect(service.refresh("old-token")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
    expect(repository.rotateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        currentHash: "old-token-hash",
        nextHash: "refresh-token-hash",
      }),
    );
    vi.mocked(repository.rotateSession).mockResolvedValueOnce(null);
    await expect(service.refresh("old-token")).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects disabled users during refresh and bearer authentication", async () => {
    vi.mocked(repository.rotateSession).mockResolvedValueOnce({
      session,
      user: { ...authUser, status: "DISABLED" },
    });
    await expect(service.refresh("token")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    vi.mocked(repository.findUserById).mockResolvedValueOnce({
      ...authUser,
      status: "DISABLED",
    });
    await expect(service.authenticate("Bearer token")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("keeps logout idempotent", async () => {
    await service.logout();
    expect(repository.revokeSession).not.toHaveBeenCalled();

    await service.logout("refresh-token");
    expect(repository.revokeSession).toHaveBeenCalledWith(
      "refresh-token-hash",
      expect.any(Date),
    );
  });
});
