import { z, type ZodType } from "zod";

import { SlideError } from "../slide.errors";

export interface AnimationRenderOutput {
  className: string;
  keyframesCss: string;
  durationMs: number;
  delayMs: number;
}

export interface AnimationDefinition<TOptions = unknown> {
  key: string;
  optionsSchema: ZodType<TOptions>;
  defaultOptions(): TOptions;
  render(options: TOptions): AnimationRenderOutput;
}

type AnyAnimationDefinition = AnimationDefinition<unknown>;

// Animation implementations are application-owned and versioned as a whole
// registry (not per-key) so historical revisions render exactly as they did
// when authored even after new versions add or change definitions - see
// design.md's "Keep animation implementations outside the database".
export class AnimationRegistry {
  private readonly versions = new Map<number, Map<string, AnyAnimationDefinition>>();

  registerVersion(version: number, definitions: AnyAnimationDefinition[]): void {
    if (this.versions.has(version)) throw new Error(`Animation registry version already registered: ${version}`);
    const byKey = new Map<string, AnyAnimationDefinition>();
    definitions.forEach((definition) => byKey.set(definition.key, definition as AnyAnimationDefinition));
    this.versions.set(version, byKey);
  }

  private requireVersion(version: number): Map<string, AnyAnimationDefinition> {
    const definitions = this.versions.get(version);
    if (!definitions) throw new SlideError("INVALID_INPUT", `Unsupported animation registry version: ${version}`);
    return definitions;
  }

  require(version: number, key: string): AnyAnimationDefinition {
    const definition = this.requireVersion(version).get(key);
    if (!definition) throw new SlideError("INVALID_INPUT", `Unsupported animation key: ${key}`);
    return definition;
  }

  // Registry metadata for UI (e.g. the design editor's animation picker) -
  // callers list available keys instead of hardcoding them, so a new
  // registered animation appears automatically.
  listKeys(version: number): string[] {
    return Array.from(this.requireVersion(version).keys());
  }

  validateOptions(version: number, key: string, options: unknown): unknown {
    const definition = this.require(version, key);
    const result = definition.optionsSchema.safeParse(options);
    if (!result.success) {
      throw new SlideError("INVALID_INPUT", `Invalid options for animation ${key}: ${result.error.issues[0]?.message ?? "invalid"}`);
    }
    return result.data;
  }

  resolve(version: number, key: string, options: unknown): AnimationRenderOutput {
    const definition = this.require(version, key);
    const validated = this.validateOptions(version, key, options);
    return definition.render(validated);
  }
}

const timingSchema = z
  .object({
    durationMs: z.number().int().min(0).max(10_000).default(500),
    delayMs: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

type TimingOptions = z.infer<typeof timingSchema>;

function timingDefinition(key: string, keyframesCss: string): AnyAnimationDefinition {
  const definition: AnimationDefinition<TimingOptions> = {
    key,
    optionsSchema: timingSchema,
    defaultOptions: () => timingSchema.parse({}),
    render: (options) => ({
      className: `slai-anim-${key}`,
      keyframesCss,
      durationMs: options.durationMs,
      delayMs: options.delayMs,
    }),
  };
  return definition as AnyAnimationDefinition;
}

export const animationRegistry = new AnimationRegistry();

animationRegistry.registerVersion(1, [
  timingDefinition("fade", "@keyframes slai-anim-fade{from{opacity:0}to{opacity:1}}"),
  timingDefinition(
    "slide-in",
    "@keyframes slai-anim-slide-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}",
  ),
  timingDefinition("zoom", "@keyframes slai-anim-zoom{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}"),
]);

export const CURRENT_ANIMATION_REGISTRY_VERSION = 1;
