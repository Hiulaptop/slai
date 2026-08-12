// Exercises the real @tailwindcss/cli subprocess, deliberately not mocked -
// see structured-repository.integration.test.ts's doc comment for the same
// rationale applied to a different kind of real dependency: the entire
// point of this module is "did we actually invoke a working Tailwind CLI
// and get back real CSS," which mocking would beg the question of.

import { describe, expect, it } from "vitest";

import { compileTailwindStylesheet } from "./tailwind-compiler";

describe("compileTailwindStylesheet", () => {
  it("compiles real CSS for known utility classes without scanning any files", async () => {
    const css = await compileTailwindStylesheet(["text-lg", "text-red-500"]);
    expect(css).toContain(".text-lg");
    expect(css).toContain(".text-red-500");
    expect(css).toContain("font-size");
  }, 15_000);

  it("compiles a type-hinted arbitrary-value class", async () => {
    const css = await compileTailwindStylesheet(["text-[length:90px]", "text-[color:#ff0000]"]);
    expect(css).toContain("90px");
    expect(css.toLowerCase()).toContain("#ff0000".toLowerCase());
  }, 15_000);

  it("excludes Tailwind's preflight/base reset so the stylesheet does not fight the document's own inline styling", async () => {
    const css = await compileTailwindStylesheet(["text-lg"]);
    expect(css).not.toContain("box-sizing: border-box");
    expect(css).not.toMatch(/\*\s*,\s*::after/);
  }, 15_000);

  it("disables automatic content scanning, emitting only the requested classes - never every Tailwind class used elsewhere in this project", async () => {
    const css = await compileTailwindStylesheet(["text-lg"]);
    // Regression guard: without `source(none)`, Tailwind v4 scans the whole
    // --cwd project tree and pulls in unrelated utilities actually used in
    // app/globals.css and components/*.tsx, such as these.
    expect(css).not.toContain(".flex{");
    expect(css).not.toContain(".mt-1{");
    expect(css).not.toContain(".pointer-events-auto{");
    expect(css.match(/\.[a-zA-Z-]+(\\.[a-zA-Z0-9-]+)*\{/g)?.length).toBe(1);
  }, 15_000);

  it("returns an empty string without spawning anything for an empty class list", async () => {
    await expect(compileTailwindStylesheet([])).resolves.toBe("");
  });
});
