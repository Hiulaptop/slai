import { describe, expect, it } from "vitest";

import { listWhitelistedClassPatterns, resolveTailwindTextClass } from "./tailwind-whitelist";

describe("resolveTailwindTextClass", () => {
  it("resolves every named font-size scale entry", () => {
    expect(resolveTailwindTextClass("text-xs")).toEqual({ kind: "fontSize", value: 12 });
    expect(resolveTailwindTextClass("text-base")).toEqual({ kind: "fontSize", value: 16 });
    expect(resolveTailwindTextClass("text-9xl")).toEqual({ kind: "fontSize", value: 128 });
  });

  it("resolves named color scale entries from the generated default Tailwind palette", () => {
    expect(resolveTailwindTextClass("text-black")).toEqual({ kind: "color", value: "#000" });
    expect(resolveTailwindTextClass("text-white")).toEqual({ kind: "color", value: "#fff" });
    expect(resolveTailwindTextClass("text-transparent")).toEqual({ kind: "color", value: "transparent" });
    // Every family/shade pair resolves to a real, non-empty CSS color value
    // sourced from the installed Tailwind package - see
    // tailwind-color-palette.drift.test.ts for exact-value verification
    // against the installed package, so this test does not hardcode a
    // specific color string that would go stale on a Tailwind upgrade.
    const red500 = resolveTailwindTextClass("text-red-500");
    expect(red500?.kind).toBe("color");
    expect(typeof red500?.value).toBe("string");
    expect((red500?.value as string).length).toBeGreaterThan(0);
  });

  it("resolves a valid type-hinted arbitrary length in px, rem, and em", () => {
    expect(resolveTailwindTextClass("text-[length:90px]")).toEqual({ kind: "fontSize", value: 90 });
    expect(resolveTailwindTextClass("text-[length:5rem]")).toEqual({ kind: "fontSize", value: 80 });
    expect(resolveTailwindTextClass("text-[length:2.5em]")).toEqual({ kind: "fontSize", value: 40 });
  });

  it("resolves a valid type-hinted arbitrary color in hex, rgb, and named form", () => {
    expect(resolveTailwindTextClass("text-[color:#ff0000]")).toEqual({ kind: "color", value: "#ff0000" });
    expect(resolveTailwindTextClass("text-[color:rgba(255,0,0,0.5)]")).toEqual({ kind: "color", value: "rgba(255,0,0,0.5)" });
    expect(resolveTailwindTextClass("text-[color:coral]")).toEqual({ kind: "color", value: "coral" });
  });

  it("rejects a bare arbitrary value with no type hint, even though it is unambiguous", () => {
    expect(resolveTailwindTextClass("text-[90px]")).toBeNull();
    expect(resolveTailwindTextClass("text-[#ff0000]")).toBeNull();
  });

  it("rejects an arbitrary length outside the fontSize schema's bounds", () => {
    expect(resolveTailwindTextClass("text-[length:0px]")).toBeNull();
    expect(resolveTailwindTextClass("text-[length:-10px]")).toBeNull();
    expect(resolveTailwindTextClass("text-[length:500px]")).toBeNull();
  });

  it("rejects a malformed arbitrary value", () => {
    expect(resolveTailwindTextClass("text-[length:abc]")).toBeNull();
    expect(resolveTailwindTextClass("text-[length:90vh]")).toBeNull();
    expect(resolveTailwindTextClass("text-[color:not-a-color-but-way-too-many-words]")).toBeNull();
  });

  it("rejects an unrecognized class name outright", () => {
    expect(resolveTailwindTextClass("text-huge")).toBeNull();
    expect(resolveTailwindTextClass("bg-red-500")).toBeNull();
    expect(resolveTailwindTextClass("")).toBeNull();
  });
});

describe("listWhitelistedClassPatterns", () => {
  it("lists every named font-size entry plus the arbitrary-value pattern", () => {
    const patterns = listWhitelistedClassPatterns();
    expect(patterns.fontSize).toContain("text-lg");
    expect(patterns.fontSize.some((pattern) => pattern.includes("length:"))).toBe(true);
  });

  it("summarizes the ~290-entry color palette into keywords plus one compact family/shade pattern instead of enumerating every entry", () => {
    const patterns = listWhitelistedClassPatterns();
    expect(patterns.color).toContain("text-black");
    expect(patterns.color).toContain("text-current");
    const familyShadePattern = patterns.color.find((pattern) => pattern.startsWith("text-{") && pattern.includes("|red|"));
    expect(familyShadePattern).toBeDefined();
    expect(familyShadePattern).toContain("|500|");
    expect(patterns.color.some((pattern) => pattern.includes("color:"))).toBe(true);
    // Compact, not a literal dump of every resolvable class.
    expect(patterns.color.length).toBeLessThan(20);
  });
});
