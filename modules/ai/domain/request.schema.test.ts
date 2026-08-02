import { describe, expect, it } from "vitest";

import {
  base64MediaSourceSchema,
  fileContentPartSchema,
  requestSchema,
} from "./request.schema";

const validRequest = {
  modelId: "gpt-4o",
  messages: [{ role: "user", content: "Hello" }],
};

describe("requestSchema", () => {
  it("accepts a valid request without stream", () => {
    const result = requestSchema.safeParse(validRequest);

    expect(result.success).toBe(true);
  });

  it("defaults temperature to 1", () => {
    const result = requestSchema.parse(validRequest);

    expect(result.temperature).toBe(1);
  });

  it("rejects a request containing stream", () => {
    const result = requestSchema.safeParse({
      ...validRequest,
      stream: false,
    });

    expect(result.success).toBe(false);
  });

  it("accepts normalized JSON response format", () => {
    expect(requestSchema.parse({ ...validRequest, responseFormat: "json_object" }).responseFormat).toBe("json_object");
  });

  it("rejects unsupported response formats", () => {
    expect(requestSchema.safeParse({ ...validRequest, responseFormat: "json_schema" }).success).toBe(false);
  });
});

describe("base64MediaSourceSchema", () => {
  it("accepts a valid base64 file source", () => {
    const result = base64MediaSourceSchema.safeParse({
      kind: "base64",
      mediaType: "application/pdf",
      data: "JVBERi0xLjQ=",
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty base64 value", () => {
    const result = base64MediaSourceSchema.safeParse({
      kind: "base64",
      mediaType: "application/pdf",
      data: "",
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing media type", () => {
    const result = base64MediaSourceSchema.safeParse({
      kind: "base64",
      data: "JVBERi0xLjQ=",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid media type", () => {
    const result = base64MediaSourceSchema.safeParse({
      kind: "base64",
      mediaType: "pdf",
      data: "JVBERi0xLjQ=",
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown properties", () => {
    const result = base64MediaSourceSchema.safeParse({
      kind: "base64",
      mediaType: "application/pdf",
      data: "JVBERi0xLjQ=",
      filePath: "/private/document.pdf",
    });

    expect(result.success).toBe(false);
  });
});

describe("fileContentPartSchema", () => {
  it("accepts a file with a base64 source", () => {
    const result = fileContentPartSchema.safeParse({
      type: "file",
      filename: "report.pdf",
      source: {
        kind: "base64",
        mediaType: "application/pdf",
        data: "JVBERi0xLjQ=",
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects an empty filename", () => {
    const result = fileContentPartSchema.safeParse({
      type: "file",
      filename: "",
      source: {
        kind: "base64",
        mediaType: "application/pdf",
        data: "JVBERi0xLjQ=",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects a missing source", () => {
    const result = fileContentPartSchema.safeParse({
      type: "file",
      filename: "report.pdf",
    });

    expect(result.success).toBe(false);
  });

  it("rejects an invalid media source", () => {
    const result = fileContentPartSchema.safeParse({
      type: "file",
      filename: "report.pdf",
      source: {
        kind: "base64",
        mediaType: "pdf",
        data: "",
      },
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown properties", () => {
    const result = fileContentPartSchema.safeParse({
      type: "file",
      filename: "report.pdf",
      source: {
        kind: "base64",
        mediaType: "application/pdf",
        data: "JVBERi0xLjQ=",
      },
      file_data: "provider-specific-value",
    });

    expect(result.success).toBe(false);
  });
});
