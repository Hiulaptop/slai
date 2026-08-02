import { jwtVerify, SignJWT } from "jose";

import type { AccessTokenService } from "../application/auth.ports";
import { AuthConfigurationError } from "../domain/auth.errors";

const ISSUER = "slai";
const AUDIENCE = "slai-api";
const EXPIRATION = "15m";

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  const encoded = new TextEncoder().encode(secret);

  if (!secret || encoded.byteLength < 32) {
    throw new AuthConfigurationError(
      "JWT_SECRET must contain at least 32 UTF-8 bytes",
    );
  }

  return encoded;
}

export const accessTokenService: AccessTokenService = {
  async sign(userId, sessionId) {
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(EXPIRATION)
      .sign(getSecret());
  },
  async verify(token) {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    if (!payload.sub || typeof payload.sid !== "string") {
      throw new Error("Invalid access token claims");
    }

    return { userId: payload.sub, sessionId: payload.sid };
  },
};
