export type CliProxyProvider = "openai" | "gemini";

export type FetchLike = typeof fetch;

export interface CliProxyConfig {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}

export interface AdapterRequestOptions {
  signal?: AbortSignal;
}

export interface AIUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AIResponse {
  text: string;
  model: string;
  finishReason: string | null;
  usage: AIUsage;
}

export type AIStreamEvent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "done";
      response: AIResponse;
    };

export interface OpenAITextContentPart {
  type: "text";
  text: string;
}

export interface OpenAIFileContentPart {
  type: "file";
  file: {
    filename: string;
    file_data: string;
  };
}

export type OpenAIContentPart =
  | OpenAITextContentPart
  | OpenAIFileContentPart;

export interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string | OpenAIContentPart[];
}

export interface OpenAIRequestPayload {
  model: string;
  messages: OpenAIMessage[];
  temperature: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  stream: boolean;
  stream_options?: {
    include_usage: true;
  };
}

export interface GeminiTextPart {
  text: string;
}

export interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequestPayload {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiTextPart[];
  };
  generationConfig: {
    temperature: number;
    maxOutputTokens?: number;
    responseMimeType?: "application/json";
  };
}
