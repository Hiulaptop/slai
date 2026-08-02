import type { AIRequest } from "../../domain/request.schema";
import { CliProxyAdapter } from "./adapter";
import type {
  AIResponse,
  AIStreamEvent,
  AIUsage,
  CliProxyConfig,
  OpenAIContentPart,
  OpenAIMessage,
  OpenAIRequestPayload,
} from "./adapter.types";

export class OpenAICliProxyAdapter extends CliProxyAdapter {
  protected readonly generatePath = "/v1/chat/completions";
  protected readonly streamPath = "/v1/chat/completions";

  constructor(config: CliProxyConfig) {
    super("openai", config);
  }

  protected buildRequest(
    request: AIRequest,
    stream: boolean,
  ): OpenAIRequestPayload {
    return {
      model: request.modelId,
      messages: request.messages.map((message): OpenAIMessage => ({
        role: message.role,
        content:
          typeof message.content === "string"
            ? message.content
            : message.content.map(
                (part): OpenAIContentPart =>
                  part.type === "text"
                    ? { type: "text", text: part.text }
                    : {
                        type: "file",
                        file: {
                          filename: part.filename,
                          file_data: `data:${part.source.mediaType};base64,${part.source.data}`,
                        },
                      },
              ),
      })),
      temperature: request.temperature,
      ...(request.maxOutputTokens === undefined
        ? {}
        : { max_tokens: request.maxOutputTokens }),
      ...(request.responseFormat === "json_object"
        ? { response_format: { type: "json_object" as const } }
        : {}),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
    };
  }

  protected parseResponse(body: unknown): AIResponse {
    const response = asRecord(body, "OpenAI response");
    const model = asString(response.model, "OpenAI response model");
    const choices = asArray(response.choices, "OpenAI response choices");

    if (choices.length === 0) {
      throw new Error("OpenAI response choices are empty");
    }

    const choice = asRecord(choices[0], "OpenAI response choice");
    const message = asRecord(choice.message, "OpenAI response message");
    const text = asString(message.content, "OpenAI response message content");
    const finishReason = parseFinishReason(
      choice.finish_reason,
      "OpenAI response finish reason",
    );

    return {
      text,
      model,
      finishReason,
      usage: parseUsage(response.usage, "OpenAI response usage"),
    };
  }

  protected async *parseStreamResponse(
    payloads: AsyncIterable<string>,
  ): AsyncGenerator<AIStreamEvent> {
    let text = "";
    let model: string | undefined;
    let finishReason: string | null | undefined;
    let usage: AIUsage | undefined;

    for await (const payload of payloads) {
      if (payload === "[DONE]") {
        if (
          model === undefined ||
          finishReason === undefined ||
          usage === undefined
        ) {
          throw new Error("OpenAI stream ended without a complete response");
        }

        yield {
          type: "done",
          response: {
            text,
            model,
            finishReason,
            usage,
          },
        };
        return;
      }

      let body: unknown;

      try {
        body = JSON.parse(payload) as unknown;
      } catch {
        throw new Error("Malformed OpenAI stream JSON");
      }

      const chunk = asRecord(body, "OpenAI stream response");
      model = asString(chunk.model, "OpenAI stream model");
      const choices = asArray(chunk.choices, "OpenAI stream choices");

      if (chunk.usage !== undefined && chunk.usage !== null) {
        usage = parseUsage(chunk.usage, "OpenAI stream usage");
      }

      if (choices.length === 0) {
        continue;
      }

      const choice = asRecord(choices[0], "OpenAI stream choice");
      const delta = asRecord(choice.delta, "OpenAI stream delta");
      finishReason = parseFinishReason(
        choice.finish_reason,
        "OpenAI stream finish reason",
      );

      if (delta.content !== undefined) {
        const fragment = asString(
          delta.content,
          "OpenAI stream delta content",
        );
        text += fragment;

        if (fragment.length > 0) {
          yield { type: "text", text: fragment };
        }
      }
    }
  }
}

function parseUsage(value: unknown, label: string): AIUsage {
  const usage = asRecord(value, label);
  return {
    promptTokens: asNumber(usage.prompt_tokens, `${label} prompt_tokens`),
    completionTokens: asNumber(
      usage.completion_tokens,
      `${label} completion_tokens`,
    ),
    totalTokens: asNumber(usage.total_tokens, `${label} total_tokens`),
  };
}

function parseFinishReason(
  value: unknown,
  label: string,
): string | null {
  if (value === null) {
    return null;
  }

  return asString(value, label);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  return value;
}

function asString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }

  return value;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number`);
  }

  return value;
}
