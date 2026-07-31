import { requestSchema, type AIRequest } from "../../domain/request.schema";
import { CliProxyError } from "./adapter.errors";
import type {
  AdapterRequestOptions,
  AIResponse,
  AIStreamEvent,
  CliProxyConfig,
  CliProxyProvider,
  FetchLike,
} from "./adapter.types";
import { decodeSseData } from "./sse";

export abstract class CliProxyAdapter {
  protected abstract readonly generatePath: string;
  protected abstract readonly streamPath: string;

  private readonly provider: CliProxyProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetcher: FetchLike;

  protected constructor(
    provider: CliProxyProvider,
    config: CliProxyConfig,
  ) {
    this.provider = provider;
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetcher = config.fetch ?? fetch;
  }

  protected abstract buildRequest(
    request: AIRequest,
    stream: boolean,
  ): unknown;

  protected abstract parseResponse(body: unknown): AIResponse;

  protected abstract parseStreamResponse(
    payloads: AsyncIterable<string>,
  ): AsyncIterable<AIStreamEvent>;

  async generate(
    request: AIRequest,
    options?: AdapterRequestOptions,
  ): Promise<AIResponse> {
    const parsedRequest = requestSchema.parse(request);
    const response = await this.send(
      this.generatePath,
      this.buildRequest(parsedRequest, false),
      options,
    );
    const body = await this.readJson(response);

    try {
      return this.parseResponse(body);
    } catch (error) {
      throw this.wrapError(error, response.status);
    }
  }

  async *stream(
    request: AIRequest,
    options?: AdapterRequestOptions,
  ): AsyncGenerator<AIStreamEvent> {
    const parsedRequest = requestSchema.parse(request);
    const response = await this.send(
      this.streamPath,
      this.buildRequest(parsedRequest, true),
      options,
    );

    if (!response.body) {
      throw new CliProxyError(
        this.provider,
        "Streaming response has no body",
        response.status,
        [this.apiKey],
      );
    }

    try {
      yield* this.parseStreamResponse(decodeSseData(response.body));
    } catch (error) {
      throw this.wrapError(error, response.status);
    }
  }

  private async send(
    path: string,
    body: unknown,
    options?: AdapterRequestOptions,
  ): Promise<Response> {
    let response: Response;

    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    } catch (error) {
      throw this.wrapError(error);
    }

    if (!response.ok) {
      const message = await this.readErrorMessage(response);
      throw new CliProxyError(
        this.provider,
        `CLIProxy request failed (${response.status}): ${message}`,
        response.status,
        [this.apiKey],
      );
    }

    return response;
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new CliProxyError(
        this.provider,
        `CLIProxy returned non-JSON response (${response.status}): ${text}`,
        response.status,
        [this.apiKey],
      );
    }
  }

  private async readErrorMessage(response: Response): Promise<string> {
    const text = await response.text();

    try {
      const body: unknown = JSON.parse(text);

      if (isRecord(body)) {
        const error = body.error;

        if (typeof error === "string") {
          return error;
        }

        if (isRecord(error) && typeof error.message === "string") {
          return error.message;
        }

        if (typeof body.message === "string") {
          return body.message;
        }
      }
    } catch {
      // Use the response text when the provider does not return JSON.
    }

    return text || response.statusText || "Unknown provider error";
  }

  private wrapError(error: unknown, status?: number): CliProxyError {
    if (error instanceof CliProxyError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new CliProxyError(
      this.provider,
      message,
      status,
      [this.apiKey],
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
