export const REFRESH_COOKIE_NAME = "slai_refresh_token";
export const REFRESH_SESSION_SECONDS = 60 * 60 * 24 * 30;

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    maxAge: REFRESH_SESSION_SECONDS,
  };
}

export function clearRefreshCookieOptions() {
  return { ...refreshCookieOptions(), maxAge: 0 };
}
