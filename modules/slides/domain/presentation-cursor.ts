import { SlideError } from "./slide.errors";
import {
  presentationCursorSchema,
  type PresentationCursor,
} from "./slide.schemas";

export function encodePresentationCursor(cursor: {
  createdAt: Date;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodePresentationCursor(value: string): PresentationCursor {
  try {
    return presentationCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch (cause) {
    throw new SlideError("INVALID_INPUT", "Invalid presentation cursor", {
      cause,
    });
  }
}
