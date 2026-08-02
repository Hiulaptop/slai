import { describe, expect, it } from "vitest";

import {
  decodePresentationCursor,
  encodePresentationCursor,
} from "./presentation-cursor";
import { presentationListQuerySchema } from "./slide.schemas";

const id = "123e4567-e89b-12d3-a456-426614174000";

describe("presentation pagination contracts", () => {
  it("defaults the list limit and accepts the maximum", () => {
    expect(presentationListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(presentationListQuerySchema.parse({ limit: "50" }).limit).toBe(50);
  });

  it("rejects invalid list limits", () => {
    expect(presentationListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(presentationListQuerySchema.safeParse({ limit: "51" }).success).toBe(false);
    expect(presentationListQuerySchema.safeParse({ limit: "1.5" }).success).toBe(false);
  });

  it("round trips an opaque cursor", () => {
    const createdAt = new Date("2026-08-02T00:00:00.000Z");
    const cursor = encodePresentationCursor({ createdAt, id });
    expect(cursor).not.toContain("2026-08-02");
    expect(decodePresentationCursor(cursor)).toEqual({
      createdAt: createdAt.toISOString(),
      id,
    });
  });

  it("rejects malformed and schema-invalid cursors", () => {
    expect(() => decodePresentationCursor("not-json")).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    const invalid = Buffer.from(JSON.stringify({ createdAt: "bad", id })).toString("base64url");
    expect(() => decodePresentationCursor(invalid)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
  });
});
