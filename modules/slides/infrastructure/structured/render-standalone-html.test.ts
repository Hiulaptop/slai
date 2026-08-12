import { beforeEach, describe, expect, it, vi } from "vitest";

import { elementRegistry, type TextProps } from "../../domain/structured/elements";
import type { ElementNode, StructuredRevision } from "../../domain/structured/types";

const mocks = vi.hoisted(() => ({ compileTailwindStylesheet: vi.fn() }));
vi.mock("./tailwind-compiler", async () => {
  const actual = await vi.importActual<typeof import("./tailwind-compiler")>("./tailwind-compiler");
  return { ...actual, compileTailwindStylesheet: mocks.compileTailwindStylesheet };
});

import { renderStandaloneHtml } from "./render-standalone-html";

// Captured through `vi.importActual` (not a normal import of "./tailwind-compiler",
// which `vi.mock` above intercepts for every importer including this file) so
// this is genuinely the real, unmocked implementation - wiring the mock's
// default behavior to call itself would recurse forever instead.
let realCompile: typeof import("./tailwind-compiler")["compileTailwindStylesheet"];

function textNode(overrides: Partial<ElementNode> = {}): ElementNode {
  const defaults = elementRegistry.createDefaults("text", 1) as TextProps;
  return {
    id: "text1",
    type: "text",
    schemaVersion: 1,
    geometry: { x: 0, y: 0, width: 200, height: 40, zIndex: 0 },
    props: defaults,
    animation: null,
    children: [],
    ...overrides,
  };
}

function revision(elements: ElementNode[]): StructuredRevision {
  return { animationRegistryVersion: 1, slides: [{ number: 1, width: 960, height: 540, props: {}, elements }] };
}

describe("renderStandaloneHtml", () => {
  beforeEach(async () => {
    if (!realCompile) {
      realCompile = (await vi.importActual<typeof import("./tailwind-compiler")>("./tailwind-compiler")).compileTailwindStylesheet;
    }
    mocks.compileTailwindStylesheet.mockReset();
    mocks.compileTailwindStylesheet.mockImplementation((classNames: string[]) => realCompile(classNames));
  });

  it("embeds a real compiled stylesheet covering the document's Tailwind classes", async () => {
    const html = await renderStandaloneHtml(revision([textNode()]));
    expect(html).toContain('class="text-lg');
    expect(html).toMatch(/<style>[^<]*\.text-lg[^<]*<\/style>/);
    expect(mocks.compileTailwindStylesheet).toHaveBeenCalledWith(expect.arrayContaining(["text-lg"]));
  }, 15_000);

  it("skips the compile step entirely for a document with no Tailwind classes (e.g. only shapes)", async () => {
    const shape: ElementNode = {
      id: "shape1",
      type: "shape",
      schemaVersion: 1,
      geometry: { x: 0, y: 0, width: 100, height: 100, zIndex: 0 },
      props: elementRegistry.createDefaults("shape", 1),
      animation: null,
      children: [],
    };
    const html = await renderStandaloneHtml(revision([shape]));
    expect(mocks.compileTailwindStylesheet).not.toHaveBeenCalled();
    expect(html).toContain("<!doctype html>");
  });

  it("falls back to the plain inline-style render when the compile step fails, instead of failing the request", async () => {
    mocks.compileTailwindStylesheet.mockRejectedValueOnce(new Error("tailwind cli unavailable in this environment"));
    const html = await renderStandaloneHtml(revision([textNode()]));
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("font-size:18px"); // inline style still present and correct
    expect(html).not.toContain('class="text-lg'); // fallback path has no Tailwind classes at all
  });

  it("still fails closed for a malformed stored structure, before any compile attempt", async () => {
    const malformed = textNode({ type: "chart", schemaVersion: 1 });
    await expect(renderStandaloneHtml(revision([malformed]))).rejects.toThrow(/Unable to render/);
    expect(mocks.compileTailwindStylesheet).not.toHaveBeenCalled();
  });
});
