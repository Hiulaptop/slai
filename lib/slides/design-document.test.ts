// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  clampToSlide,
  createBlankDocument,
  createImageElement,
  createShapeElement,
  createTableElement,
  createTextElement,
  isAllowedImageSrc,
  renumberSlides,
  resizeTable,
  setTableCellContent,
  SLIDE_HEIGHT,
  SLIDE_WIDTH,
  tableCellAt,
  tableCellContent,
  toWireSlides,
  type SlideDocument,
} from "./design-document";

describe("createBlankDocument", () => {
  it("creates the requested number of contiguous empty slides", () => {
    const slides = createBlankDocument(3);
    expect(slides.map((slide) => slide.number)).toEqual([1, 2, 3]);
    expect(slides.every((slide) => slide.elements.length === 0)).toBe(true);
    expect(slides.every((slide) => slide.width === SLIDE_WIDTH && slide.height === SLIDE_HEIGHT)).toBe(true);
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
      { number: 5, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [] },
      { number: 1, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [] },
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

describe("element creation helpers", () => {
  it("creates a text element with registry defaults and clamped geometry", () => {
    const element = createTextElement(-50, -50, 0);
    expect(element.type).toBe("text");
    expect(element.geometry.x).toBe(0);
    expect(element.geometry.y).toBe(0);
    expect((element.props as { text: string }).text).toBe("Text");
  });

  it("creates each shape variant with the requested shapeType", () => {
    expect((createShapeElement("rectangle", 0, 0, 0).props as { shapeType: string }).shapeType).toBe("rectangle");
    expect((createShapeElement("ellipse", 0, 0, 0).props as { shapeType: string }).shapeType).toBe("ellipse");
    expect((createShapeElement("line", 0, 0, 0).props as { shapeType: string }).shapeType).toBe("line");
  });

  it("creates an image element with the given src/alt", () => {
    const element = createImageElement("data:image/png;base64,AAAA", "logo", 0, 0, 0);
    expect(element.props).toMatchObject({ src: "data:image/png;base64,AAAA", alt: "logo" });
  });
});

describe("table helpers", () => {
  it("creates a table pre-populated with one blank cell per grid slot", () => {
    const table = createTableElement(2, 3, 0, 0, 0);
    expect(table.props).toMatchObject({ rows: 2, columns: 3 });
    expect(table.children).toHaveLength(6);
    expect(tableCellAt(table, 0, 0)?.type).toBe("table-cell");
    expect(tableCellAt(table, 1, 2)?.type).toBe("table-cell");
  });

  it("resizes a table, preserving existing cell content by slot and dropping cells outside the new bounds", () => {
    const table = createTableElement(2, 2, 0, 0, 0);
    const withContent = setTableCellContent(table, 0, 0, createTextElement(0, 0, 0));
    const grown = resizeTable(withContent, 3, 3);
    expect(grown.children).toHaveLength(9);
    expect(tableCellContent(grown, 0, 0)).not.toBeNull();

    const shrunk = resizeTable(grown, 1, 1);
    expect(shrunk.children).toHaveLength(1);
    expect(tableCellContent(shrunk, 0, 0)).not.toBeNull();
  });

  it("sets and clears a cell's single content child", () => {
    const table = createTableElement(1, 1, 0, 0, 0);
    const text = createTextElement(0, 0, 0);
    const withText = setTableCellContent(table, 0, 0, text);
    expect(tableCellContent(withText, 0, 0)?.id).toBe(text.id);

    const cleared = setTableCellContent(withText, 0, 0, null);
    expect(tableCellContent(cleared, 0, 0)).toBeNull();
  });
});

describe("toWireSlides", () => {
  it("converts the local scene graph into the flat wire shape the API expects", () => {
    const table = setTableCellContent(createTableElement(1, 1, 10, 20, 0), 0, 0, createTextElement(0, 0, 0));
    const slide: SlideDocument = { number: 5, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: { backgroundColor: "#ffffff" }, elements: [table] };

    const [wire] = toWireSlides([slide]);
    expect(wire.number).toBe(1);
    expect(wire.backgroundColor).toBe("#ffffff");
    expect(wire.elements).toHaveLength(1);
    expect(wire.elements[0].type).toBe("table");
    expect(wire.elements[0].geometry).toMatchObject({ x: 10, y: 20 });
    expect(wire.elements[0].children).toHaveLength(1);
    expect(wire.elements[0].children![0].slotKey).toBe("r0c0");
    expect(wire.elements[0].children![0].element.children![0].element.type).toBe("text");
    // nested content has no canvas geometry of its own
    expect(wire.elements[0].children![0].element.children![0].element.geometry).toBeNull();
  });

  it("omits geometry for nested content and renumbers slides", () => {
    const slides: SlideDocument[] = [
      { number: 4, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [] },
      { number: 7, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [] },
    ];
    const wire = toWireSlides(slides);
    expect(wire.map((slide) => slide.number)).toEqual([1, 2]);
  });

  it("maps an element's animation reference into the flat duration/delay wire shape", () => {
    const element = { ...createTextElement(0, 0, 0), animation: { key: "fade", props: { durationMs: 300, delayMs: 50 } } };
    const slide: SlideDocument = { number: 1, width: SLIDE_WIDTH, height: SLIDE_HEIGHT, props: {}, elements: [element] };
    const [wire] = toWireSlides([slide]);
    expect(wire.elements[0].animation).toEqual({ key: "fade", durationMs: 300, delayMs: 50 });
  });
});
