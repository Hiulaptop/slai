// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  clampToSlide,
  createBlankDocument,
  isAllowedImageSrc,
  parseDesignSlides,
  renumberSlides,
  serializeDesignDocument,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  type DesignSlide,
  type SlideElement,
} from "./design-document";

function element(overrides: Partial<SlideElement> & { type: SlideElement["type"] }): SlideElement {
  const base = { id: "el-1", x: 10, y: 20, width: 100, height: 40, zIndex: 0 };
  switch (overrides.type) {
    case "text":
      return { ...base, text: "Hello", fontSize: 24, color: "#171713", align: "left", ...overrides };
    case "rectangle":
      return { ...base, fill: "#2448d8", stroke: "#171713", ...overrides };
    case "ellipse":
      return { ...base, fill: "#2448d8", stroke: "#171713", ...overrides };
    case "line":
      return { ...base, stroke: "#171713", ...overrides };
    case "image":
      return { ...base, src: "data:image/png;base64,AAAA", alt: "logo", ...overrides };
  }
}

describe("createBlankDocument", () => {
  it("creates the requested number of contiguous empty slides", () => {
    const slides = createBlankDocument(3);
    expect(slides.map((slide) => slide.number)).toEqual([1, 2, 3]);
    expect(slides.every((slide) => slide.elements.length === 0)).toBe(true);
  });

  it("clamps slide count to at least 1 and at most 50", () => {
    expect(createBlankDocument(0)).toHaveLength(1);
    expect(createBlankDocument(-5)).toHaveLength(1);
    expect(createBlankDocument(999)).toHaveLength(50);
  });
});

describe("renumberSlides", () => {
  it("reassigns contiguous one-based numbers regardless of input order/gaps", () => {
    const slides: DesignSlide[] = [
      { number: 5, elements: [] },
      { number: 1, elements: [] },
    ];
    expect(renumberSlides(slides).map((slide) => slide.number)).toEqual([1, 2]);
  });
});

describe("clampToSlide", () => {
  it("keeps elements within the slide bounds", () => {
    expect(clampToSlide({ x: -50, y: -50, width: 100, height: 100 })).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(clampToSlide({ x: SLIDE_WIDTH, y: SLIDE_HEIGHT, width: 100, height: 100 })).toEqual({
      x: SLIDE_WIDTH - 100,
      y: SLIDE_HEIGHT - 100,
      width: 100,
      height: 100,
    });
  });

  it("never shrinks below the minimum element size or grows past the slide", () => {
    expect(clampToSlide({ x: 0, y: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0, width: 8, height: 8 });
    expect(clampToSlide({ x: 0, y: 0, width: SLIDE_WIDTH * 2, height: SLIDE_HEIGHT * 2 })).toEqual({
      x: 0,
      y: 0,
      width: SLIDE_WIDTH,
      height: SLIDE_HEIGHT,
    });
  });
});

describe("isAllowedImageSrc", () => {
  it("allows only data: URLs of the supported image types", () => {
    expect(isAllowedImageSrc("data:image/png;base64,AAAA")).toBe(true);
    expect(isAllowedImageSrc("data:image/jpeg;base64,AAAA")).toBe(true);
    expect(isAllowedImageSrc("data:image/webp;base64,AAAA")).toBe(true);
  });

  it("rejects remote URLs, scripts, and unsupported image types", () => {
    expect(isAllowedImageSrc("https://example.com/x.png")).toBe(false);
    expect(isAllowedImageSrc("javascript:alert(1)")).toBe(false);
    expect(isAllowedImageSrc("data:image/svg+xml;base64,AAAA")).toBe(false);
  });
});

describe("serializeDesignDocument + parseDesignSlides round-trip", () => {
  it("round-trips every element type through serialize -> parse", () => {
    const slides: DesignSlide[] = [
      {
        number: 1,
        elements: [
          element({ type: "text", id: "t1", x: 5, y: 5, width: 200, height: 60, text: "Title <b>&</b>", align: "center", fontSize: 32 }),
          element({ type: "rectangle", id: "r1", zIndex: 1 }),
          element({ type: "ellipse", id: "e1", zIndex: 2 }),
          element({ type: "line", id: "l1", zIndex: 3 }),
          element({ type: "image", id: "i1", zIndex: 4 }),
        ],
      },
    ];

    const html = serializeDesignDocument("My Deck", slides);
    const parsed = parseDesignSlides(html);

    expect(parsed).toHaveLength(1);
    expect(parsed[0].number).toBe(1);
    expect(parsed[0].elements).toHaveLength(5);

    const byId = Object.fromEntries(parsed[0].elements.map((el) => [el.id, el]));
    expect(byId.t1).toMatchObject({ type: "text", text: "Title <b>&</b>", align: "center", fontSize: 32, x: 5, y: 5, width: 200, height: 60 });
    expect(byId.r1).toMatchObject({ type: "rectangle", fill: "#2448d8", stroke: "#171713" });
    expect(byId.e1).toMatchObject({ type: "ellipse" });
    expect(byId.l1).toMatchObject({ type: "line", stroke: "#171713" });
    expect(byId.i1).toMatchObject({ type: "image", src: "data:image/png;base64,AAAA", alt: "logo" });
  });

  it("drops image elements whose src is not an allowed data: URL", () => {
    const html = serializeDesignDocument("Deck", [
      { number: 1, elements: [element({ type: "image", src: "https://evil.example/x.png" })] },
    ]);
    // Simulate an untrusted/hand-edited document referencing a remote image.
    const tampered = html.replace("data:image/png;base64,AAAA", "https://evil.example/x.png");
    expect(parseDesignSlides(tampered)[0].elements).toHaveLength(0);
  });

  it("ignores non-design elements (scripts, forms, unknown nodes) inside a slide wrapper", () => {
    const html =
      '<!doctype html><html><body><div class="slai-slide" data-slide-number="1">' +
      '<script>alert(1)</script><form></form><span>plain text</span>' +
      "</div></body></html>";
    expect(parseDesignSlides(html)[0].elements).toHaveLength(0);
  });

  it("throws on non-contiguous slide numbering", () => {
    const html =
      '<!doctype html><html><body>' +
      '<div class="slai-slide" data-slide-number="1"></div>' +
      '<div class="slai-slide" data-slide-number="3"></div>' +
      "</body></html>";
    expect(() => parseDesignSlides(html)).toThrow("invalid slide numbering");
  });

  it("renumbers slides on serialize even if input numbering has gaps", () => {
    const slides: DesignSlide[] = [
      { number: 4, elements: [] },
      { number: 7, elements: [] },
    ];
    const parsed = parseDesignSlides(serializeDesignDocument("Deck", slides));
    expect(parsed.map((slide) => slide.number)).toEqual([1, 2]);
  });
});
