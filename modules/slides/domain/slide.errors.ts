export type SlideErrorCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PROVIDER_ERROR"
  | "INVALID_MODEL_OUTPUT"
  | "RENDER_FAILED";

export class SlideError extends Error {
  constructor(
    readonly code: SlideErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SlideError";
  }
}
