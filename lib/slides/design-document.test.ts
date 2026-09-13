// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { createBlankDocument, renumberSlides, SLIDE_HEIGHT, SLIDE_WIDTH, toWireSlides, type SlideDocument } from "./design-document";

describe("createBlankDocument", () => {
  it("creates the requested number of contiguous empty slides", () => {
    const slides = createBlankDocument(3);
    expect(slides.map((slide) => slide.number)).toEqual([1, 2, 3]);
    expect(slides.every((slide) => slide.html === "" && slide.css === "")).toBe(true);
  });

  it("clamps slide count to at least 1 and at most 50", () => {
    expect(createBlankDocument(0)).toHaveLength(1);
    expect(createBlankDocument(-5)).toHaveLength(1);
    expect(createBlankDocument(999)).toHaveLength(50);
  });
});

describe("renumberSlides", () => {
  it("reassigns contiguous one-based numbers regardless of input order/gaps", () => {
    const slides: SlideDocument[] = [
      { number: 5, html: "", css: "" },
      { number: 1, html: "", css: "" },
    ];
    expect(renumberSlides(slides).map((slide) => slide.number)).toEqual([1, 2]);
  });
});

describe("SLIDE_WIDTH / SLIDE_HEIGHT", () => {
  it("stay the fixed 16:9 canvas size", () => {
    expect(SLIDE_WIDTH).toBe(960);
    expect(SLIDE_HEIGHT).toBe(540);
  });
});

describe("toWireSlides", () => {
  it("renumbers slides and passes their html/css through unchanged", () => {
    const slides: SlideDocument[] = [
      { number: 5, html: "<p>five</p>", css: ".x{color:red}" },
      { number: 1, html: "<p>one</p>", css: "" },
    ];
    const wire = toWireSlides(slides);
    expect(wire.map((slide) => slide.number)).toEqual([1, 2]);
    expect(wire[0]).toMatchObject({ html: "<p>five</p>", css: ".x{color:red}" });
  });
});
