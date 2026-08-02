import { NextRequest, NextResponse } from "next/server";

import { authService } from "@/modules/auth/infrastructure/auth";
import {
  clearRefreshCookie,
  getRefreshToken,
} from "@/modules/auth/presentation/route-helpers";

export async function POST(request: NextRequest) {
  try {
    await authService.logout(getRefreshToken(request));
  } catch {
    // Logout is intentionally idempotent even if session cleanup fails.
  }

  const response = new NextResponse(null, { status: 204 });
  clearRefreshCookie(response);
  return response;
}
