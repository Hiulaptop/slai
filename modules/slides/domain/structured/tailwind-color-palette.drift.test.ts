// Verifies the committed generated palette (tailwind-color-palette.generated.ts)
// still matches what scripts/generate-tailwind-color-palette.mjs would
// produce from the currently installed `tailwindcss` package. This is the
// only place in the codebase that imports `tailwindcss/colors` at test time
// (besides the generator script itself) - the runtime whitelist module never
// does, keeping class resolution a plain synchronous object lookup. If this
// test fails, run `node scripts/generate-tailwind-color-palette.mjs` and
// commit the result.

import { createRequire } from "node:module";

import colors from "tailwindcss/colors";
import { describe, expect, it } from "vitest";

import { buildTailwindTextColorPalette } from "../../../../scripts/generate-tailwind-color-palette.mjs";
import { TAILWIND_COLOR_PALETTE_SOURCE_VERSION, TAILWIND_DEFAULT_TEXT_COLORS } from "./tailwind-color-palette.generated";

const require = createRequire(import.meta.url);
const installedTailwindVersion = (require("tailwindcss/package.json") as { version: string }).version;

describe("tailwind-color-palette.generated.ts (drift check)", () => {
  it("was generated from the currently installed tailwindcss version", () => {
    expect(TAILWIND_COLOR_PALETTE_SOURCE_VERSION).toBe(installedTailwindVersion);
  });

  it("matches what the generator script would produce right now", () => {
    const fresh = buildTailwindTextColorPalette(colors);
    expect(TAILWIND_DEFAULT_TEXT_COLORS).toEqual(fresh);
  });

  it("covers every default color family exposed by the installed package", () => {
    const expectedFamilies = Object.entries(colors)
      .filter(([, value]) => typeof value === "object")
      .map(([family]) => family)
      .sort();
    const coveredFamilies = new Set<string>();
    for (const key of Object.keys(TAILWIND_DEFAULT_TEXT_COLORS)) {
      const match = key.match(/^text-([a-z]+)-\d+$/);
      if (match) coveredFamilies.add(match[1]);
    }
    expect([...coveredFamilies].sort()).toEqual(expectedFamilies);
  });
});
