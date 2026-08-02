import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import type { AuthUser, SessionMetadata } from "../domain/auth.types";
import { AuthError } from "../domain/auth.errors";
import {
  clearRefreshCookieOptions,
  REFRESH_COOKIE_NAME,
  refreshCookieOptions,
} from "../infrastructure/refresh-cookie";

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AuthError("INVALID_INPUT", "Invalid request body");
  }
}

export function requestMetadata(request: Request): SessionMetadata {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0];
  const ipAddress = forwardedFor?.trim() || undefined;
  const userAgent = request.headers.get("user-agent") || undefined;

  return {
    ...(ipAddress ? { ipAddress: ipAddress.slice(0, 45) } : {}),
    ...(userAgent ? { userAgent: userAgent.slice(0, 1000) } : {}),
  };
}

export function authResponse(
  result: { user: AuthUser; accessToken: string; refreshToken: string },
  status: number,
) {
  const response = NextResponse.json(
    { user: result.user, accessToken: result.accessToken },
    { status },
  );
  setRefreshCookie(response, result.refreshToken);
  return response;
}

export function accessTokenResponse(result: {
  accessToken: string;
  refreshToken: string;
}) {
  const response = NextResponse.json({ accessToken: result.accessToken });
  setRefreshCookie(response, result.refreshToken);
  return response;
}

export function getRefreshToken(request: NextRequest): string | undefined {
  return request.cookies.get(REFRESH_COOKIE_NAME)?.value;
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE_NAME, "", clearRefreshCookieOptions());
}

export function authErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError || isInvalidInput(error)) {
    return NextResponse.json(
      { error: { code: "INVALID_INPUT", message: "Invalid request" } },
      { status: 400 },
    );
  }

  if (error instanceof AuthError) {
    const status = error.code === "REGISTRATION_FAILED" ? 409 : 401;
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status },
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
    { status: 500 },
  );
}

function setRefreshCookie(response: NextResponse, token: string): void {
  response.cookies.set(REFRESH_COOKIE_NAME, token, refreshCookieOptions());
}

function isInvalidInput(error: unknown): boolean {
  return error instanceof AuthError && error.code === "INVALID_INPUT";
}
