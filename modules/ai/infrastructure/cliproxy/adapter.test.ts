import { describe, expect, it, vi } from "vitest";

import type { AIRequest } from "../../domain/request.schema";
import { CliProxyAdapter } from "./adapter";
import {
  CliProxyError,
  UnsupportedCliProxyProviderError,
} from "./adapter.errors";
import type {
  AIResponse,
  AIStreamEvent,
  CliProxyConfig,
} from "./adapter.types";

const validRequest: AIRequest = {
  modelId: "test-model",
  messages: [{ role: "user", content: "Hello" }],
  temperature: 0,
};

describe("adapter errors", () => {
  it("identifies unsupported providers", () => {
    const error = new UnsupportedCliProxyProviderError("anthropic");

    expect(error).toMatchObject({
      name: "UnsupportedCliProxyProviderError",
      provider: "anthropic",
      message: expect.stringContaining("anthropic"),
    });
  });
});

class TestAdapter extends CliProxyAdapter {
  readonly generatePath = "/v1/generate";
  readonly streamPath = "/v1/stream";

  constructor(config: CliProxyConfig) {
    super("openai", config);
  }

  protected buildRequest(request: AIRequest, stream: boolean): unknown {
    return {
      model: request.modelId,
      messages: request.messages,
      stream,
    };
  }

  protected parseResponse(body: unknown): AIResponse {
    if (
      typeof body !== "object" ||
      body === null ||
      !("text" in body) ||
      typeof body.text !== "string"
    ) {
      throw new Error("Response text is missing");
    }

    return {
      text: body.text,
      model: "test-model",
      finishReason: "stop",
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
      },
    };
  }

  protected async *parseStreamResponse(
    payloads: AsyncIterable<string>,
  ): AsyncGenerator<AIStreamEvent> {
    for await (const payload of payloads) {
      yield { type: "text", text: payload };
    }
  }
}

describe("CliProxyAdapter", () => {
  it("normalizes trailing slashes in the base URL", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        text: "done",
      }),
    );
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test///",
      apiKey: "secret",
      fetch,
    });

    await adapter.generate(validRequest);

    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1/generate",
      expect.any(Object),
    );
  });

  it("sends Bearer authentication and JSON content headers", async () => {
    const fetch = vi.fn(async () => Response.json({ text: "done" }));
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await adapter.generate(validRequest);

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: {
          Authorization: "Bearer secret",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("forwards an abort signal", async () => {
    const fetch = vi.fn(async () => Response.json({ text: "done" }));
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });
    const controller = new AbortController();

    await adapter.generate(validRequest, { signal: controller.signal });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("validates requests before sending them", async () => {
    const fetch = vi.fn(async () => Response.json({ text: "done" }));
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(
      // @ts-expect-error Runtime callers can supply invalid input.
      adapter.generate({ messages: [] }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports non-2xx JSON errors with provider and status", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: "quota exceeded" } },
        { status: 429 },
      ),
    );
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    const error = await adapter
      .generate(validRequest)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CliProxyError);
    expect(error).toMatchObject({
      provider: "openai",
      status: 429,
      message: expect.stringContaining("quota exceeded"),
    });
  });

  it("reports non-2xx text errors", async () => {
    const fetch = vi.fn(async () =>
      new Response("gateway unavailable", { status: 502 }),
    );
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(validRequest)).rejects.toMatchObject({
      status: 502,
      message: expect.stringContaining("gateway unavailable"),
    });
  });

  it("rejects non-JSON successful responses", async () => {
    const fetch = vi.fn(async () => new Response("not json"));
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(validRequest)).rejects.toMatchObject({
      provider: "openai",
      status: 200,
      message: expect.stringContaining("non-JSON"),
    });
  });

  it("wraps successful response body read failures", async () => {
    const apiKey = "ok-response-secret";
    const response = new Response(null, { status: 200 });
    vi.spyOn(response, "text").mockRejectedValue(
      new Error(`failed to read ${apiKey}`),
    );
    const fetch = vi.fn(async () => response);
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey,
      fetch,
    });

    const error = await adapter
      .generate(validRequest)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CliProxyError);
    expect(error).toMatchObject({
      provider: "openai",
      status: 200,
      message: expect.stringContaining("[REDACTED]"),
    });

    if (!(error instanceof CliProxyError)) {
      throw new Error("Expected adapter to throw CliProxyError");
    }

    expect(error.message).not.toContain(apiKey);
  });

  it("wraps error response body read failures", async () => {
    const apiKey = "error-response-secret";
    const response = new Response(null, { status: 503 });
    vi.spyOn(response, "text").mockRejectedValue(
      new Error(`failed to read ${apiKey}`),
    );
    const fetch = vi.fn(async () => response);
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey,
      fetch,
    });

    const error = await adapter
      .generate(validRequest)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(CliProxyError);
    expect(error).toMatchObject({
      provider: "openai",
      status: 503,
      message: expect.stringContaining("[REDACTED]"),
    });

    if (!(error instanceof CliProxyError)) {
      throw new Error("Expected adapter to throw CliProxyError");
    }

    expect(error.message).not.toContain(apiKey);
  });

  it("rejects a streaming response without a body", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    const consume = async () => {
      for await (const event of adapter.stream(validRequest)) {
        void event;
      }
    };

    await expect(consume()).rejects.toMatchObject({
      provider: "openai",
      status: 200,
      message: expect.stringContaining("body"),
    });
  });

  it("redacts the API key from response error messages", async () => {
    const apiKey = "highly-sensitive-key";
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { message: `request rejected for ${apiKey}` } },
        { status: 401 },
      ),
    );
    const adapter = new TestAdapter({
      baseUrl: "https://proxy.test",
      apiKey,
      fetch,
    });

    const error = await adapter
      .generate(validRequest)
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(Error);

    if (!(error instanceof Error)) {
      throw new Error("Expected adapter to throw an Error");
    }

    expect(error.message).not.toContain(apiKey);
    expect(error.message).toContain("[REDACTED]");
  });
});
