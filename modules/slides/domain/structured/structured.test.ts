import { describe, expect, it } from "vitest";

import { sanitizeSlideCss, sanitizeSlideHtml } from "./sanitize";
import { validateStructuredCommand } from "./validate";
import type { SlideDocument } from "./types";

function slide(number: number, overrides: Partial<SlideDocument> = {}): SlideDocument {
  return { number, html: "<p>hello</p>", css: "", ...overrides };
}

describe("sanitizeSlideHtml", () => {
  it("strips script tags", () => {
    expect(sanitizeSlideHtml("<p>hi</p><script>alert(1)</script>", "INVALID_INPUT")).not.toContain("<script");
  });

  it("strips inline event-handler attributes", () => {
    expect(sanitizeSlideHtml('<div onclick="alert(1)">hi</div>', "INVALID_INPUT")).not.toContain("onclick");
  });

  it("rejects a javascript: href", () => {
    const cleaned = sanitizeSlideHtml('<a href="javascript:alert(1)">click</a>', "INVALID_INPUT");
    expect(cleaned).not.toContain("javascript:");
  });

  it("allows ordinary layout/content markup", () => {
    const html = '<div class="card"><h1>Title</h1><p>Body</p><img src="data:image/png;base64,AAAA" alt="x"/></div>';
    expect(sanitizeSlideHtml(html, "INVALID_INPUT")).toContain("<h1>Title</h1>");
  });

  it("rejects oversized html", () => {
    const huge = "<p>" + "x".repeat(300_000) + "</p>";
    expect(() => sanitizeSlideHtml(huge, "INVALID_INPUT")).toThrow(/exceeds the maximum size/);
  });
});

describe("sanitizeSlideCss", () => {
  it("allows ordinary css", () => {
    expect(sanitizeSlideCss(".card{color:red}", "INVALID_INPUT")).toBe(".card{color:red}");
  });

  it("rejects @import", () => {
    expect(() => sanitizeSlideCss('@import url("https://evil.example/x.css");', "INVALID_INPUT")).toThrow(/disallowed content/);
  });

  it("rejects a javascript: url", () => {
    expect(() => sanitizeSlideCss('.x{background:url("javascript:alert(1)")}', "INVALID_INPUT")).toThrow(/disallowed content/);
  });

  it("rejects embedded script tags", () => {
    expect(() => sanitizeSlideCss("</style><script>alert(1)</script>", "INVALID_INPUT")).toThrow(/disallowed content/);
  });
});

describe("validateStructuredCommand", () => {
  it("accepts a valid contiguous document", () => {
    expect(() => validateStructuredCommand([slide(1), slide(2)])).not.toThrow();
  });

  it("rejects non-contiguous slide numbers by default", () => {
    expect(() => validateStructuredCommand([slide(1), slide(3)])).toThrow(/contiguous/);
  });

  it("rejects duplicate slide numbers even in a sparse replacement set", () => {
    expect(() => validateStructuredCommand([slide(1), slide(1)], { requireContiguousFromOne: false })).toThrow(/Duplicate/);
  });

  it("allows a sparse, non-contiguous replacement set when requireContiguousFromOne is false", () => {
    expect(() => validateStructuredCommand([slide(2), slide(5)], { requireContiguousFromOne: false })).not.toThrow();
  });

  it("rejects an empty document", () => {
    expect(() => validateStructuredCommand([])).toThrow(/at least one slide/);
  });

  it("rejects a document exceeding the slide count limit", () => {
    const slides = Array.from({ length: 51 }, (_, index) => slide(index + 1));
    expect(() => validateStructuredCommand(slides)).toThrow(/cannot exceed/);
  });
});
