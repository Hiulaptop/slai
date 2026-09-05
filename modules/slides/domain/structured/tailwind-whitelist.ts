// Developer-maintained whitelist of Tailwind utility class patterns this
// application resolves for text elements' fontSize/color - see
// design.md ("Type-hinted arbitrary values only", "Whitelist is
// developer-controlled only") in openspec/changes/add-tailwind-text-styling/.
// An AI response only ever SELECTS a class from what this module resolves;
// it never defines or extends the whitelist itself.
//
// Font-size named-scale values are Tailwind's standard type scale (stable
// since Tailwind v1, unchanged in v4's default theme), safe to hand-maintain
// as plain px numbers matching how `text.ts`'s TextProps.fontSize is already
// stored and rendered.
//
// Color named-scale values come from `tailwind-color-palette.generated.ts`,
// a static file produced by `scripts/generate-tailwind-color-palette.mjs`
// from the installed `tailwindcss` package's own `tailwindcss/colors` export
// - the full default palette (every family, every shade, whatever the
// installed Tailwind version actually ships), not a hand-transcribed subset.
// `tailwind-color-palette.drift.test.ts` fails if the committed generated
// file no longer matches the installed package, so an upgrade that changes
// default color values cannot silently go stale. This module itself never
// imports `tailwindcss` - only the generator script and the drift test do -
// so class resolution here stays a plain synchronous object lookup, with no
// Tailwind invocation on the request path.

import { TAILWIND_DEFAULT_TEXT_COLORS } from "./tailwind-color-palette.generated";

export type TailwindClassKind = "fontSize" | "color";

export interface TailwindClassMatch {
  kind: TailwindClassKind;
  value: number | string;
}

// Matches text.ts's textPropsSchema: `fontSize: z.number().positive().max(400)`.
const MIN_FONT_SIZE_EXCLUSIVE = 0;
const MAX_FONT_SIZE = 400;

const FONT_SIZE_SCALE: Readonly<Record<string, number>> = {
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
  "text-5xl": 48,
  "text-6xl": 60,
  "text-7xl": 72,
  "text-8xl": 96,
  "text-9xl": 128,
};

const NAMED_COLOR_SCALE: Readonly<Record<string, string>> = TAILWIND_DEFAULT_TEXT_COLORS;

// Requires an explicit type hint (`length:`/`color:`) rather than replicating
// Tailwind's own bracket-shape inference - see design.md's "Type-hinted
// arbitrary values only" decision. Length allows px/rem/em; rem/em are
// resolved against a fixed 16px root, matching this application's canvas
// (there is no separate parent font-size context for a slide text element).
const ARBITRARY_LENGTH = /^text-\[length:(-?\d+(?:\.\d+)?)(px|rem|em)\]$/;
const ARBITRARY_COLOR = /^text-\[color:(#[0-9a-fA-F]{3,8}|rgba?\([^[\]]+\)|hsla?\([^[\]]+\)|[a-zA-Z]+)\]$/;
const REM_OR_EM_TO_PX = 16;

function resolveArbitraryLength(rawValue: string, unit: string): number | null {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return null;
  const px = unit === "px" ? numeric : numeric * REM_OR_EM_TO_PX;
  if (px <= MIN_FONT_SIZE_EXCLUSIVE || px > MAX_FONT_SIZE) return null;
  return px;
}

// Resolves one Tailwind utility class against the whitelist, or returns null
// for anything unrecognized or malformed (including a bare, non-type-hinted
// arbitrary value) - callers are responsible for failing closed on `null`,
// this function never substitutes a default or nearest match.
export function resolveTailwindTextClass(className: string): TailwindClassMatch | null {
  if (className in FONT_SIZE_SCALE) return { kind: "fontSize", value: FONT_SIZE_SCALE[className] };
  if (className in NAMED_COLOR_SCALE) return { kind: "color", value: NAMED_COLOR_SCALE[className] };

  const lengthMatch = className.match(ARBITRARY_LENGTH);
  if (lengthMatch) {
    const px = resolveArbitraryLength(lengthMatch[1], lengthMatch[2]);
    return px === null ? null : { kind: "fontSize", value: px };
  }

  const colorMatch = className.match(ARBITRARY_COLOR);
  if (colorMatch) return { kind: "color", value: colorMatch[1] };

  return null;
}

const FAMILY_SHADE_KEY = /^text-([a-z]+)-(\d+)$/;

// The full named color scale is ~290 entries (every family x every shade) -
// too large to enumerate literally in a prompt without bloating every
// request. This collapses it into one compact `text-{family|family}-{shade|shade}`
// pattern derived from the actual generated table (not a hardcoded guess at
// which families/shades exist), so the prompt stays accurate as the
// generated file changes without needing a hand-updated pattern string.
function summarizeNamedColorPatterns(): string[] {
  const keywords: string[] = [];
  const shadesByFamily = new Map<string, Set<string>>();
  for (const key of Object.keys(NAMED_COLOR_SCALE)) {
    const match = key.match(FAMILY_SHADE_KEY);
    if (!match) {
      keywords.push(key);
      continue;
    }
    const [, family, shade] = match;
    const shades = shadesByFamily.get(family) ?? new Set<string>();
    shades.add(shade);
    shadesByFamily.set(family, shades);
  }

  const families = [...shadesByFamily.keys()].sort();
  const allShades = new Set<string>();
  for (const shades of shadesByFamily.values()) for (const shade of shades) allShades.add(shade);
  const shades = [...allShades].sort((a, b) => Number(a) - Number(b));

  const patterns = keywords.sort();
  if (families.length) patterns.push(`text-{${families.join("|")}}-{${shades.join("|")}}`);
  return patterns;
}

// Registry metadata for prompt construction (task 3.1/3.2) - lists every
// whitelisted pattern so the AI system prompt can enumerate real, current
// values instead of hand-duplicating this table as prose.
export function listWhitelistedClassPatterns(): { fontSize: string[]; color: string[] } {
  return {
    fontSize: [...Object.keys(FONT_SIZE_SCALE), "text-[length:<value><px|rem|em>]"],
    color: [...summarizeNamedColorPatterns(), "text-[color:<#hex|rgb()|hsl()|css-name>]"],
  };
}

// Reverse lookups (already-resolved value -> class name), used by render.ts's
// Tailwind-class output mode to regenerate a valid whitelisted class from a
// persisted element's concrete fontSize/color - see design.md's "Render
// output has two modes" decision in openspec/changes/add-tailwind-text-styling/.
// Prefers a named-scale class when the value exactly matches one (e.g.
// 18 -> "text-lg"), falling back to a type-hinted arbitrary-value class
// otherwise, so every resolvable value round-trips to some valid class.
const FONT_SIZE_CLASS_BY_VALUE = new Map(Object.entries(FONT_SIZE_SCALE).map(([key, value]) => [value, key]));
const COLOR_CLASS_BY_VALUE = new Map(Object.entries(NAMED_COLOR_SCALE).map(([key, value]) => [value, key]));

export function classNameForFontSize(px: number): string {
  return FONT_SIZE_CLASS_BY_VALUE.get(px) ?? `text-[length:${px}px]`;
}

export function classNameForColor(value: string): string {
  return COLOR_CLASS_BY_VALUE.get(value) ?? `text-[color:${value}]`;
}
