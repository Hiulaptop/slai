import { describe, expect, it, vi } from "vitest";

import type { AIRequest } from "../../domain/request.schema";
import { CliProxyError } from "./adapter.errors";
import { OpenAICliProxyAdapter } from "./openai.adapter";

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
  adapter: OpenAICliProxyAdapter,
  request: AIRequest,
) {
  const events = [];

  for await (const event of adapter.stream(request)) {
    events.push(event);
  }

  return events;
}

const textRequest: AIRequest = {
  modelId: "gpt-4.1-mini",
  messages: [
    { role: "system", content: "Be concise." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
  ],
  temperature: 0.25,
  maxOutputTokens: 128,
};

describe("OpenAICliProxyAdapter", () => {
  it("maps a text-only request and normalizes a completion", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        model: "gpt-4.1-mini-2025-04-14",
        choices: [
          {
            message: { content: "Hello back" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 8,
          completion_tokens: 2,
          total_tokens: 10,
        },
      }),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(textRequest)).resolves.toEqual({
      text: "Hello back",
      model: "gpt-4.1-mini-2025-04-14",
      finishReason: "stop",
      usage: {
        promptTokens: 8,
        completionTokens: 2,
        totalTokens: 10,
      },
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1/chat/completions",
      expect.objectContaining({
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: textRequest.messages,
          temperature: 0.25,
          max_tokens: 128,
          stream: false,
        }),
      }),
    );
  });

  it("maps mixed structured text and base64 file content", async () => {
    const request: AIRequest = {
      modelId: "gpt-4.1",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this file" },
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
      ],
      temperature: 1,
    };
    const fetch = vi.fn(async () =>
      Response.json({
        model: "gpt-4.1",
        choices: [
          {
            message: { content: "It says hello." },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 4,
          total_tokens: 16,
        },
      }),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await adapter.generate(request);

    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1/chat/completions",
      expect.objectContaining({
        body: JSON.stringify({
          model: "gpt-4.1",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Read this file" },
                {
                  type: "file",
                  file: {
                    filename: "notes.txt",
                    file_data: "data:text/plain;base64,SGVsbG8=",
                  },
                },
              ],
            },
          ],
          temperature: 1,
          stream: false,
        }),
      }),
    );
  });

  it("rejects malformed successful completion payloads", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        model: "gpt-4.1-mini",
        choices: [{ message: { content: 42 }, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
        },
      }),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(adapter.generate(textRequest)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });

  it("reassembles fragmented SSE and emits text plus one normalized done event", async () => {
    const first =
      'data: {"model":"gpt-4.1-mini-2025-04-14","choices":[{"delta":{"content":"Hel"},"finish_reason":null}],"usage":null}\n\n';
    const second =
      'data: {"model":"gpt-4.1-mini-2025-04-14","choices":[{"delta":{"content":"lo"},"finish_reason":"stop"}],"usage":null}\n\n';
    const usage =
      'data: {"model":"gpt-4.1-mini-2025-04-14","choices":[],"usage":{"prompt_tokens":8,"completion_tokens":2,"total_tokens":10}}\n\n';
    const fetch = vi.fn(async () =>
      new Response(
        streamFrom(
          first.slice(0, 13),
          first.slice(13) + second.slice(0, 47),
          second.slice(47) + usage + "data: [DO",
          "NE]\n\n",
        ),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, textRequest)).resolves.toEqual([
      { type: "text", text: "Hel" },
      { type: "text", text: "lo" },
      {
        type: "done",
        response: {
          text: "Hello",
          model: "gpt-4.1-mini-2025-04-14",
          finishReason: "stop",
          usage: {
            promptTokens: 8,
            completionTokens: 2,
            totalTokens: 10,
          },
        },
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://proxy.test/v1/chat/completions",
      expect.objectContaining({
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          messages: textRequest.messages,
          temperature: 0.25,
          max_tokens: 128,
          stream: true,
          stream_options: { include_usage: true },
        }),
      }),
    );
  });

  it("rejects malformed JSON stream events", async () => {
    const fetch = vi.fn(async () =>
      new Response(streamFrom("data: {not-json}\n\n")),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, textRequest)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });

  it("rejects malformed successful stream payloads", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        streamFrom(
          'data: {"model":"gpt-4.1-mini","choices":[{"delta":{"content":7},"finish_reason":null}],"usage":null}\n\n',
          "data: [DONE]\n\n",
        ),
      ),
    );
    const adapter = new OpenAICliProxyAdapter({
      baseUrl: "https://proxy.test",
      apiKey: "secret",
      fetch,
    });

    await expect(collectStream(adapter, textRequest)).rejects.toBeInstanceOf(
      CliProxyError,
    );
  });
});
