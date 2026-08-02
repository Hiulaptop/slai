import type {
  AccessTokenResponse,
  ApiErrorBody,
  AuthResponse,
  AuthUser,
  Credentials,
} from "../types";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type SessionListener = (snapshot: AuthSnapshot) => void;

export type AuthSnapshot =
  | { status: "loading"; user: null }
  | { status: "anonymous"; user: null }
  | { status: "authenticated"; user: AuthUser };

let bootstrapPromise: Promise<{ accessToken: string; user: AuthUser } | null> | null =
  null;
let refreshPromise: Promise<string | null> | null = null;

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;

  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Keep the stable fallback for non-JSON upstream failures.
  }
  throw new ApiError(
    body.error?.message || "Something went wrong. Please try again.",
    response.status,
    body.error?.code,
  );
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json() as AccessTokenResponse).accessToken;
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export class AuthClient {
  private accessToken: string | null = null;
  private snapshot: AuthSnapshot = { status: "loading", user: null };
  private listeners = new Set<SessionListener>();

  getSnapshot = (): AuthSnapshot => this.snapshot;

  subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async bootstrap(): Promise<void> {
    if (!bootstrapPromise) {
      bootstrapPromise = (async () => {
        const accessToken = await refreshAccessToken();
        if (!accessToken) return null;

        const response = await fetch("/api/auth/me", {
          credentials: "same-origin",
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) return null;
        const { user } = await response.json() as { user: AuthUser };
        return { accessToken, user };
      })().catch(() => null);
    }

    const session = await bootstrapPromise;
    if (session) {
      this.accessToken = session.accessToken;
      this.update({ status: "authenticated", user: session.user });
    } else {
      this.clearSession();
    }
  }

  async login(credentials: Credentials): Promise<void> {
    await this.authenticate("/api/auth/login", credentials);
  }

  async register(credentials: Credentials): Promise<void> {
    await this.authenticate("/api/auth/register", credentials);
  }

  async logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      this.clearSession();
      bootstrapPromise = null;
    }
  }

  async authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    let response = await fetch(input, this.withAuthorization(init));
    if (response.status !== 401) return response;

    const token = await refreshAccessToken();
    if (!token) {
      this.clearSession();
      return response;
    }

    this.accessToken = token;
    response = await fetch(input, this.withAuthorization(init));
    if (response.status === 401) this.clearSession();
    return response;
  }

  private async authenticate(path: string, credentials: Credentials): Promise<void> {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(credentials),
    });
    const session = await parseResponse<AuthResponse>(response);
    this.accessToken = session.accessToken;
    bootstrapPromise = Promise.resolve(session);
    this.update({ status: "authenticated", user: session.user });
  }

  private withAuthorization(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);
    return { ...init, credentials: "same-origin", headers };
  }

  private clearSession(): void {
    this.accessToken = null;
    this.update({ status: "anonymous", user: null });
  }

  private update(snapshot: AuthSnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export function safeNextPath(value: string | null, fallback = "/home"): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export function messageForError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export function resetAuthClientForTests(): void {
  bootstrapPromise = null;
  refreshPromise = null;
}
