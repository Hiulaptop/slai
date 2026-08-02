import "server-only";

import { AuthService } from "../application/auth.service";
import { accessTokenService } from "./access-token";
import { passwordService } from "./password";
import { PrismaAuthRepository } from "./prisma-auth.repository";
import { refreshTokenService } from "./refresh-token";

export const authService = new AuthService(
  new PrismaAuthRepository(),
  passwordService,
  accessTokenService,
  refreshTokenService,
);
