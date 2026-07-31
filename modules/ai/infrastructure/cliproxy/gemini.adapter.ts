import {
  requestSchema,
  type AIRequest,
} from "../../domain/request.schema";
import { CliProxyAdapter } from "./adapter";
import type {
  AdapterRequestOptions,
  AIResponse,
  AIStreamEvent,
  AIUsage,
  CliProxyConfig,
  GeminiContent,
  GeminiPart,
  GeminiRequestPayload,
  GeminiTextPart,
} from "./adapter.types";

export class GeminiCliProxyAdapter extends CliProxyAdapter {
  protected generatePath = "";
  protected streamPath = "";

  constructor(config: CliProxyConfig) {
    super("gemini", config);
  }

  async generate(
    request: AIRequest,
    options?: AdapterRequestOptions,
  ): Promise<AIResponse> {
    const parsedRequest = requestSchema.parse(request);
    this.setRequestPath(parsedRequest.modelId, false);
    const response = await super.generate(parsedRequest, options);

    return response.model.length === 0
      ? { ...response, model: parsedRequest.modelId }
      : response;
  }

  async *stream(
    request: AIRequest,
    options?: AdapterRequestOptions,
  ): AsyncGenerator<AIStreamEvent> {
    const parsedRequest = requestSchema.parse(request);
    this.setRequestPath(parsedRequest.modelId, true);

    for await (const event of super.stream(parsedRequest, options)) {
      if (event.type === "done" && event.response.model.length === 0) {
        yield {
          ...event,
          response: {
            ...event.response,
            model: parsedRequest.modelId,
          },
        };
        continue;
      }

      yield event;
    }
  }

  protected buildRequest(
    request: AIRequest,
    stream: boolean,
  ): GeminiRequestPayload {
    this.setRequestPath(request.modelId, stream);

    const systemParts: GeminiTextPart[] = [];
    const contents: GeminiContent[] = [];

    for (const message of request.messages) {
      if (message.role === "system") {
        for (const part of toGeminiParts(
          message.content,
          "Gemini system message",
        )) {
          if (!("text" in part)) {
            throw new Error("Gemini system messages only support text parts");
          }

          systemParts.push(part);
        }
        continue;
      }

      contents.push({
        role: message.role === "assistant" ? "model" : "user",
        parts: toGeminiParts(message.content, "Gemini content"),
      });
    }

    return {
      ...(systemParts.length === 0
        ? {}
        : { systemInstruction: { parts: systemParts } }),
      contents,
      generationConfig: {
        temperature: request.temperature,
        ...(request.maxOutputTokens === undefined
          ? {}
          : { maxOutputTokens: request.maxOutputTokens }),
      },
    };
  }

  protected parseResponse(body: unknown): AIResponse {
    const response = asRecord(body, "Gemini response");
    const candidates = asArray(
      response.candidates,
      "Gemini response candidates",
    );

    if (candidates.length === 0) {
      throw new Error("Gemini response candidates are empty");
    }

    const candidate = asRecord(candidates[0], "Gemini response candidate");
    const text = parseCandidateText(candidate, "Gemini response");
    const finishReason = parseFinishReason(
      candidate.finishReason,
      "Gemini response finish reason",
    );

    return {
      text,
      model: parseModel(response.modelVersion, ""),
      finishReason,
      usage: parseUsage(response.usageMetadata, "Gemini response usage"),
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
      let body: unknown;

      try {
        body = JSON.parse(payload) as unknown;
      } catch {
        throw new Error("Malformed Gemini stream JSON");
      }

      const response = asRecord(body, "Gemini stream response");

      if (response.modelVersion !== undefined) {
        model = asString(
          response.modelVersion,
          "Gemini stream modelVersion",
        );
      }

      const candidates = asArray(
        response.candidates,
        "Gemini stream candidates",
      );

      if (
        response.usageMetadata !== undefined &&
        response.usageMetadata !== null
      ) {
        usage = parseUsage(
          response.usageMetadata,
          "Gemini stream usageMetadata",
        );
      }

      if (candidates.length === 0) {
        continue;
      }

      const candidate = asRecord(candidates[0], "Gemini stream candidate");
      const fragment = parseCandidateText(candidate, "Gemini stream");

      if (candidate.finishReason !== undefined) {
        finishReason = parseFinishReason(
          candidate.finishReason,
          "Gemini stream finish reason",
        );
      }

      text += fragment;

      if (fragment.length > 0) {
        yield { type: "text", text: fragment };
      }
    }

    if (finishReason === undefined || usage === undefined) {
      throw new Error("Gemini stream ended without a complete response");
    }

    yield {
      type: "done",
      response: {
        text,
        model: model ?? "",
        finishReason,
        usage,
      },
    };
  }

  private setRequestPath(modelId: string, stream: boolean): void {
    const modelPath = `/v1beta/models/${encodeURIComponent(modelId)}`;

    if (stream) {
      this.streamPath = `${modelPath}:streamGenerateContent?alt=sse`;
    } else {
      this.generatePath = `${modelPath}:generateContent`;
    }
  }
}

function toGeminiParts(
  content: AIRequest["messages"][number]["content"],
  label: string,
): GeminiPart[] {
  if (typeof content === "string") {
    return [{ text: content }];
  }

  return content.map((part, index): GeminiPart => {
    if (part.type === "text") {
      return { text: part.text };
    }

    if (part.type === "file") {
      return {
        inlineData: {
          mimeType: part.source.mediaType,
          data: part.source.data,
        },
      };
    }

    throw new Error(`${label} part ${index} is unsupported`);
  });
}

function parseCandidateText(
  candidate: Record<string, unknown>,
  label: string,
): string {
  const content = asRecord(candidate.content, `${label} content`);
  const parts = asArray(content.parts, `${label} content parts`);

  return parts
    .map((part, index) => {
      const parsedPart = asRecord(part, `${label} content part ${index}`);

      if (parsedPart.text === undefined) {
        return "";
      }

      return asString(parsedPart.text, `${label} content part ${index} text`);
    })
    .join("");
}

function parseModel(value: unknown, fallback: string): string {
  if (value === undefined) {
    return fallback;
  }

  return asString(value, "Gemini response modelVersion");
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

function parseUsage(value: unknown, label: string): AIUsage {
  const usage = asRecord(value, label);

  return {
    promptTokens: asNumber(
      usage.promptTokenCount,
      `${label} promptTokenCount`,
    ),
    completionTokens: asNumber(
      usage.candidatesTokenCount,
      `${label} candidatesTokenCount`,
    ),
    totalTokens: asNumber(usage.totalTokenCount, `${label} totalTokenCount`),
  };
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
