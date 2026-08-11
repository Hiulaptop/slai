import { describe, expect, it } from "vitest";

import { elementRegistry, type TextProps } from "./elements";
import { renderStructuredRevision } from "./render";
import type { ElementNode, StructuredRevision } from "./types";

function textDefaults(): TextProps {
  return elementRegistry.createDefaults("text", 1) as TextProps;
}

function textNode(overrides: Partial<ElementNode> = {}): ElementNode {
  return {
    id: "text1",
    type: "text",
    schemaVersion: 1,
    geometry: { x: 10, y: 20, width: 200, height: 40, zIndex: 1 },
    props: { ...textDefaults(), text: "Hello <world> & \"friends\"" },
    animation: null,
    children: [],
    ...overrides,
  };
}

function revision(elements: ElementNode[], overrides: Partial<StructuredRevision> = {}): StructuredRevision {
  return {
    animationRegistryVersion: 1,
    slides: [{ number: 1, width: 960, height: 540, props: {}, elements }],
    ...overrides,
  };
}

describe("renderStructuredRevision", () => {
  it("produces deterministic output for the same input", () => {
    const doc = revision([textNode()]);
    expect(renderStructuredRevision(doc)).toBe(renderStructuredRevision(doc));
  });

  it("escapes user-controlled text content", () => {
    const html = renderStructuredRevision(revision([textNode()]));
    expect(html).not.toContain("<world>");
    expect(html).toContain("&lt;world&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;friends&quot;");
  });

  it("positions top-level elements absolutely from their geometry", () => {
    const html = renderStructuredRevision(revision([textNode({ geometry: { x: 15, y: 25, width: 300, height: 50, zIndex: 2 } })]));
    expect(html).toContain("left:15px");
    expect(html).toContain("top:25px");
    expect(html).toContain("width:300px");
    expect(html).toContain("height:50px");
    expect(html).toContain("z-index:2");
  });

  it("renders table and table-cell composition with nested content", () => {
    const cellText = textNode({ id: "cellText", geometry: { x: null, y: null, width: null, height: null, zIndex: null } });
    const cell: ElementNode = {
      id: "cell",
      type: "table-cell",
      schemaVersion: 1,
      geometry: { x: null, y: null, width: null, height: null, zIndex: null },
      props: elementRegistry.createDefaults("table-cell", 1),
      animation: null,
      children: [{ slotKey: "content", orderIndex: 0, element: cellText }],
    };
    const table: ElementNode = {
      id: "table",
      type: "table",
      schemaVersion: 1,
      geometry: { x: 0, y: 0, width: 400, height: 200, zIndex: 0 },
      props: { rows: 1, columns: 1, borderColor: "#000000", borderWidth: 1 },
      animation: null,
      children: [{ slotKey: "r0c0", orderIndex: 0, element: cell }],
    };
    const html = renderStructuredRevision(revision([table]));
    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).toContain("Hello");
  });

  it("resolves animation references into application-owned class, keyframes, and timing", () => {
    const html = renderStructuredRevision(revision([textNode({ animation: { key: "fade", props: { durationMs: 300, delayMs: 50 } } })]));
    expect(html).toContain("slai-anim-fade");
    expect(html).toContain("@keyframes slai-anim-fade");
    expect(html).toContain("animation-duration:300ms");
    expect(html).toContain("animation-delay:50ms");
    expect(html).toContain('data-slai-anim="true"');
  });

  it("fails closed with a stable error for an unsupported animation reference instead of substituting one", () => {
    expect(() => renderStructuredRevision(revision([textNode({ animation: { key: "spin", props: {} } })]))).toThrow(/Unable to render/);
  });

  it("fails closed with a stable error for an unregistered element type/version", () => {
    const malformed = textNode({ type: "chart", schemaVersion: 1 });
    expect(() => renderStructuredRevision(revision([malformed]))).toThrow(/Unable to render/);
  });

  it("fails closed for a revision with no slides", () => {
    expect(() => renderStructuredRevision({ animationRegistryVersion: 1, slides: [] })).toThrow(/Unable to render/);
  });

  it("includes standalone navigation, keyboard, and print behavior with no remote runtime dependency", () => {
    const html = renderStructuredRevision(revision([textNode()]));
    expect(html).toContain("slai-export-nav");
    expect(html).toContain("data-slai-export-previous");
    expect(html).toContain("data-slai-export-next");
    expect(html).toContain("ArrowLeft");
    expect(html).toContain("@media print");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("<link");
  });

  it("marks only the first slide active by default so a static open shows one slide", () => {
    const html = renderStructuredRevision(revision([textNode()]));
    const activeCount = (html.match(/class="slai-slide"[^>]*data-slai-active="true"/g) ?? []).length;
    expect(activeCount).toBe(1);
    expect(html).toContain('data-slide-number="1" data-slai-active="true"');
  });

  it("preserves ordering across multiple slides", () => {
    const doc: StructuredRevision = {
      animationRegistryVersion: 1,
      slides: [
        { number: 1, width: 960, height: 540, props: {}, elements: [textNode({ props: { ...textDefaults(), text: "first" } })] },
        { number: 2, width: 960, height: 540, props: {}, elements: [textNode({ props: { ...textDefaults(), text: "second" } })] },
      ],
    };
    const html = renderStructuredRevision(doc);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html).toContain('data-slide-number="1"');
    expect(html).toContain('data-slide-number="2"');
  });

  it("falls back to a safe default background for an unsafe slide backgroundColor value", () => {
    const doc: StructuredRevision = {
      animationRegistryVersion: 1,
      slides: [{ number: 1, width: 960, height: 540, props: { backgroundColor: "javascript:alert(1)" }, elements: [] }],
    };
    const html = renderStructuredRevision(doc);
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain("background:#ffffff");
  });
});
