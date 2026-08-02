import { ZodType } from "zod";

import { SlideError } from "./slide.errors";

export function parseModelJson<T>(text: string, schema: ZodType<T>): T {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const json = match?.[1] ?? trimmed;

  try {
    return schema.parse(JSON.parse(json));
  } catch (cause) {
    throw new SlideError(
      "INVALID_MODEL_OUTPUT",
      "AI returned an invalid response",
      { cause },
    );
  }
}
