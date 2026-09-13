import { describe, expect, it } from "vitest";

import { renderStructuredRevision } from "./render";
import type { StructuredRevision } from "./types";

function revision(overrides: Partial<StructuredRevision> = {}): StructuredRevision {
  return { slides: [{ number: 1, html: "<p>Hello</p>", css: ".slai-slide p{color:red}" }], ...overrides };
}

describe("renderStructuredRevision", () => {
  it("produces deterministic output for the same input", () => {
    const doc = revision();
    expect(renderStructuredRevision(doc)).toBe(renderStructuredRevision(doc));
  });

  it("wraps each slide's html in a data-slide-number container", () => {
    const html = renderStructuredRevision(revision());
    expect(html).toContain('data-slide-number="1"');
    expect(html).toContain("<p>Hello</p>");
  });

  it("includes every slide's css in one stylesheet", () => {
    const html = renderStructuredRevision(revision());
    expect(html).toContain("color:red");
  });

  it("strips unsafe content defensively even if it were somehow stored", () => {
    const html = renderStructuredRevision(revision({ slides: [{ number: 1, html: '<p onclick="x()">hi</p><script>x()</script>', css: "" }] }));
    expect(html).not.toContain("onclick");
    expect(html).not.toContain("x()");
  });

  it("fails closed for a revision with no slides", () => {
    expect(() => renderStructuredRevision({ slides: [] })).toThrow(/Structured revision has no slides/);
  });

  it("includes standalone navigation, keyboard, and print behavior with no remote runtime dependency", () => {
    const html = renderStructuredRevision(revision());
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
    const html = renderStructuredRevision(revision());
    const activeCount = (html.match(/class="slai-slide" data-slide-number="\d+" data-slai-active="true"/g) ?? []).length;
    expect(activeCount).toBe(1);
    expect(html).toContain('data-slide-number="1" data-slai-active="true"');
  });

  it("preserves ordering across multiple slides", () => {
    const doc: StructuredRevision = {
      slides: [
        { number: 1, html: "<p>first</p>", css: "" },
        { number: 2, html: "<p>second</p>", css: "" },
      ],
    };
    const html = renderStructuredRevision(doc);
    expect(html.indexOf("first")).toBeLessThan(html.indexOf("second"));
    expect(html).toContain('data-slide-number="1"');
    expect(html).toContain('data-slide-number="2"');
  });
});
