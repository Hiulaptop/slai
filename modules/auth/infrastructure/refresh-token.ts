import { createHash, randomBytes } from "node:crypto";

import type { RefreshTokenService } from "../application/auth.ports";

export const refreshTokenService: RefreshTokenService = {
  generate() {
    return randomBytes(32).toString("base64url");
  },
  hash(token) {
    return createHash("sha256").update(token).digest("hex");
  },
};
