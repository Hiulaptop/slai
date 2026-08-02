import { decodeJwt } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { credentialsSchema } from "../domain/credentials.schema";
import { AuthConfigurationError } from "../domain/auth.errors";
import { accessTokenService } from "./access-token";
import { passwordService } from "./password";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_SESSION_SECONDS,
  refreshCookieOptions,
} from "./refresh-cookie";
import { refreshTokenService } from "./refresh-token";

describe("auth primitives", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("normalizes valid credentials and bounds password length", () => {
    expect(
      credentialsSchema.parse({ email: " User@Example.COM ", password: "12345678" }),
    ).toEqual({ email: "user@example.com", password: "12345678" });
    expect(() =>
      credentialsSchema.parse({ email: "invalid", password: "short" }),
    ).toThrow();
    expect(() =>
      credentialsSchema.parse({
        email: "user@example.com",
        password: "x".repeat(129),
      }),
    ).toThrow();
  });

  it("hashes and verifies passwords without preserving plaintext", async () => {
    const passwordHash = await passwordService.hash("correct horse");

    expect(passwordHash).not.toContain("correct horse");
    await expect(
      passwordService.verify("correct horse", passwordHash),
    ).resolves.toBe(true);
    await expect(passwordService.verify("wrong", passwordHash)).resolves.toBe(
      false,
    );
  });

  it("issues and verifies bounded access-token claims", async () => {
    vi.stubEnv("JWT_SECRET", "x".repeat(32));

    const token = await accessTokenService.sign("user-id", "session-id");
    const claims = decodeJwt(token);

    expect(claims).toMatchObject({
      sub: "user-id",
      sid: "session-id",
      iss: "slai",
      aud: "slai-api",
    });
    expect((claims.exp ?? 0) - (claims.iat ?? 0)).toBe(900);
    await expect(accessTokenService.verify(token)).resolves.toEqual({
      userId: "user-id",
      sessionId: "session-id",
    });
  });

  it("rejects short JWT secrets", async () => {
    vi.stubEnv("JWT_SECRET", "too-short");

    await expect(accessTokenService.sign("user", "session")).rejects.toBeInstanceOf(
      AuthConfigurationError,
    );
  });

  it("creates random refresh tokens and stable SHA-256 hashes", () => {
    const first = refreshTokenService.generate();
    const second = refreshTokenService.generate();

    expect(first).not.toBe(second);
    expect(refreshTokenService.hash(first)).toMatch(/^[a-f0-9]{64}$/);
    expect(refreshTokenService.hash(first)).toBe(refreshTokenService.hash(first));
  });

  it("defines secure refresh-cookie attributes", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(REFRESH_COOKIE_NAME).toBe("slai_refresh_token");
    expect(refreshCookieOptions()).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/api/auth",
      maxAge: REFRESH_SESSION_SECONDS,
    });
  });
});
