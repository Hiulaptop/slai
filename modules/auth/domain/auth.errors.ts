export type AuthErrorCode =
  | "INVALID_INPUT"
  | "REGISTRATION_FAILED"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED";

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}
