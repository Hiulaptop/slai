import { describe, expect, it, vi } from "vitest";

import type { AIRequest } from "../../domain/request.schema";
import { CliProxyError } from "./adapter.errors";
import { GeminiCliProxyAdapter } from "./gemini.adapter";

const encoder = new TextEncoder();

function streamFrom(...chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      controller.close();
    },
  });
}

async function collectStream(
  adapter: GeminiCliProxyAdapter,
  request: AIRequest,
) {
  const events = [];

  for await (const event of adapter.stream(request)) {
    events.push(event);
  }

  return events;
}

const request: AIRequest = {
  modelId: "gemini/2.5 flash?preview",
  messages: [
    { role: "system", content: "Use concise prose." },
    { role: "system", content: "Use complete sentences." },
    { role: "user", content: "Read this." },
    { role: "assistant", content: "I will read it." },
  ],
  temperature: 0.25,
  maxOutputTokens: 128,
};

describe("GeminiCliProxyAdapter", () => {
  it("maps system instructions, roles, mixed parts, URL encoding, and generation config", async () => {
    const mixedRequest: AIRequest = {
      ...request,
      messages: [
        ...request.messages.slice(0, 2),
        {
          role: "user",
          content: [
            { type: "text", text: "Read this file." },
            {
              type: "file",
              filename: "notes.txt",
              source: {
                kind: "base64",
                mediaType: "text/plain",
                data: "SGVsbG8=",
              },
            },
          ],
        },
        { role: "assistant", content: "I will read it." },
      ],
    };
    const fetch = vi.fn(async () =>
      Response.json({
        modelVersion: "gemini-2.5-flash-preview",
        candidates: [
          {
            content: { parts: [{ text: "It says hello." }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 12,
          candidatesTokenCount: 4,
          totalTokenCount: 16,
        },
      }),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test/",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(mixedRequest)).resolves.toEqual({
      text: "It says hello.",
      model: "gemini-2.5-flash-preview",
      finishReason: "STOP",
      usage: {
        promptTokens: 12,
        completionTokens: 4,
        totalTokens: 16,
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1beta/models/gemini%2F2.5%20flash%3Fpreview:generateContent",
      expect.objectContaining({
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              { text: "Use concise prose." },
              { text: "Use complete sentences." },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [
                { text: "Read this file." },
                { inlineData: { mimeType: "text/plain", data: "SGVsbG8=" } },
              ],
            },
            { role: "model", parts: [{ text: "I will read it." }] },
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 128,
          },
        }),
      }),
    );
  });

  it("falls back to the request model when the response omits modelVersion", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: "Hello back" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 8,
          candidatesTokenCount: 2,
          totalTokenCount: 10,
        },
      }),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(request)).resolves.toMatchObject({
      model: request.modelId,
    });
  });

  it("keeps request-model fallbacks isolated across concurrent requests", async () => {
    let resolveFirst: ((response: Response) => void) | undefined;
    const fetch = vi.fn((url: string | URL | Request) => {
      if (String(url).includes("model-a")) {
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      }

      return Promise.resolve(
        Response.json({
          candidates: [
            {
              content: { parts: [{ text: "Second" }] },
              finishReason: "STOP",
            },
          ],
          usageMetadata: {
            promptTokenCount: 1,
            candidatesTokenCount: 1,
            totalTokenCount: 2,
          },
        }),
      );
    });
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });
    const firstRequest = {
      ...request,
      modelId: "model-a",
    };
    const secondRequest = {
      ...request,
      modelId: "model-b",
    };

    const first = adapter.generate(firstRequest);
    const second = adapter.generate(secondRequest);

    await expect(second).resolves.toMatchObject({ model: "model-b" });
    resolveFirst?.(
      Response.json({
        candidates: [
          {
            content: { parts: [{ text: "First" }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
    );
    await expect(first).resolves.toMatchObject({ model: "model-a" });
  });

  it("reassembles fragmented SSE, emits text parts, and emits one normalized done event", async () => {
    const first =
      'data: {"modelVersion":"gemini-2.5-flash","candidates":[{"content":{"parts":[{"text":"Hel"}]}}],"usageMetadata":null}\n\n';
    const second =
      'data: {"modelVersion":"gemini-2.5-flash","candidates":[{"content":{"parts":[{"text":"lo"}]},"finishReason":"STOP"}],"usageMetadata":null}\n\n';
    const usage =
      'data: {"modelVersion":"gemini-2.5-flash","candidates":[],"usageMetadata":{"promptTokenCount":8,"candidatesTokenCount":2,"totalTokenCount":10}}\n\n';
    const fetch = vi.fn(async () =>
      new Response(
        streamFrom(
          first.slice(0, 17),
          first.slice(17) + second.slice(0, 53),
          second.slice(53) + usage,
        ),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, request)).resolves.toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      {
        type: "done",
        response: {
          text: "Hello",
          model: "gemini-2.5-flash",
          finishReason: "STOP",
          usage: {
            promptTokens: 8,
            completionTokens: 2,
            totalTokens: 10,
          },
        },
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1beta/models/gemini%2F2.5%20flash%3Fpreview:streamGenerateContent?alt=sse",
      expect.objectContaining({
        body: expect.any(String),
      }),
    );
  });

  it("rejects malformed successful completion payloads", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        candidates: [{ content: { parts: [{ text: 42 }] }, finishReason: "STOP" }],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 1,
          totalTokenCount: 2,
        },
      }),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(request)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });

  it("rejects malformed JSON stream events", async () => {
    const fetch = vi.fn(async () =>
      new Response(streamFrom("data: {not-json}\n\n")),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, request)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });

  it("rejects malformed successful stream payloads", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        streamFrom(
          'data: {"candidates":[{"content":{"parts":[{"text":7}]},"finishReason":null}],"usageMetadata":null}\n\n',
        ),
      ),
    );
    const adapter = new GeminiCliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, request)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });
});
