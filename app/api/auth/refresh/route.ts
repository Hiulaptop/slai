import { NextRequest } from "next/server";

import { AuthError } from "@/modules/auth/domain/auth.errors";
import { authService } from "@/modules/auth/infrastructure/auth";
import {
  accessTokenResponse,
  authErrorResponse,
  clearRefreshCookie,
  getRefreshToken,
} from "@/modules/auth/presentation/route-helpers";

export async function POST(request: NextRequest) {
  try {
    const refreshToken = getRefreshToken(request);

    if (!refreshToken) {
      throw new AuthError("UNAUTHORIZED", "Unauthorized");
    }

    return accessTokenResponse(await authService.refresh(refreshToken));
  } catch (error) {
    const response = authErrorResponse(error);
    clearRefreshCookie(response);
    return response;
  }
}
