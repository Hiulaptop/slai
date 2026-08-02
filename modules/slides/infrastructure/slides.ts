import "server-only";
import { z } from "zod";
import { GeminiCliProxyAdapter } from "../../ai/infrastructure/cliproxy/gemini.adapter";
import { OpenAICliProxyAdapter } from "../../ai/infrastructure/cliproxy/openai.adapter";
import { SlideService } from "../application/slide.service";
import { PrismaSlideRepository } from "./prisma-slide.repository";

let aiConfiguration: ReturnType<typeof createAIConfiguration> | undefined;

function createAIConfiguration() {
  const config = z.object({ provider: z.enum(["openai", "gemini"]), baseUrl: z.url(), apiKey: z.string().min(1), modelId: z.string().min(1) }).parse({ provider: process.env.CLIPROXY_PROVIDER, baseUrl: process.env.CLIPROXY_BASE_URL, apiKey: process.env.CLIPROXY_API_KEY, modelId: process.env.SLIDE_MODEL_ID });
  const generator = config.provider === "openai" ? new OpenAICliProxyAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey }) : new GeminiCliProxyAdapter({ baseUrl: config.baseUrl, apiKey: config.apiKey });
  return { generator, provider: config.provider, modelId: config.modelId };
}

export const slideService = new SlideService(
  new PrismaSlideRepository(),
  () => aiConfiguration ??= createAIConfiguration(),
);
