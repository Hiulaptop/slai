import { describe, expect, it } from "vitest";

import { parseLegacyDesignHtml, UnsupportedLegacyHtmlError } from "./legacy-design-parser";

function wrap(body: string): string {
  return `<!doctype html><html><body>${body}</body></html>`;
}

describe("parseLegacyDesignHtml", () => {
  it("parses every legacy marker element type into the new wire shape", () => {
    const html = wrap(
      '<div class="slai-slide" data-slide-number="1">' +
        '<div data-slai-el="t1" data-slai-el-type="text" data-slai-font-size="32" data-slai-color="#111111" data-slai-align="center" style="position:absolute;left:5px;top:5px;width:200px;height:60px;z-index:1;">Hello</div>' +
        '<div data-slai-el="r1" data-slai-el-type="rectangle" data-slai-fill="#ff0000" data-slai-stroke="#000000" style="position:absolute;left:0px;top:0px;width:10px;height:10px;z-index:0;"></div>' +
        '<div data-slai-el="e1" data-slai-el-type="ellipse" data-slai-fill="#00ff00" data-slai-stroke="#000000" style="position:absolute;left:0px;top:0px;width:10px;height:10px;z-index:0;"></div>' +
        '<svg data-slai-el="l1" data-slai-el-type="line" data-slai-stroke="#000000" style="position:absolute;left:0px;top:0px;width:10px;height:10px;z-index:0;"></svg>' +
        '<img data-slai-el="i1" data-slai-el-type="image" src="data:image/png;base64,AAAA" alt="logo" style="position:absolute;left:0px;top:0px;width:10px;height:10px;z-index:0;" />' +
        "</div>",
    );

    const [slide] = parseLegacyDesignHtml(html);
    expect(slide.number).toBe(1);
    expect(slide.elements).toHaveLength(5);

    const text = slide.elements[0];
    expect(text).toMatchObject({ type: "text", geometry: { x: 5, y: 5, width: 200, height: 60, zIndex: 1 }, props: { text: "Hello", fontSize: 32, color: "#111111", align: "center" } });

    const rectangle = slide.elements[1];
    expect(rectangle).toMatchObject({ type: "shape", props: { shapeType: "rectangle", fill: "#ff0000", stroke: "#000000" } });

    const ellipse = slide.elements[2];
    expect(ellipse).toMatchObject({ type: "shape", props: { shapeType: "ellipse", fill: "#00ff00" } });

    const line = slide.elements[3];
    expect(line).toMatchObject({ type: "shape", props: { shapeType: "line", stroke: "#000000" } });

    const image = slide.elements[4];
    expect(image).toMatchObject({ type: "image", props: { src: "data:image/png;base64,AAAA", alt: "logo" } });
  });

  it("drops an image element whose src is not an allowed data: URL instead of failing the whole slide", () => {
    const html = wrap(
      '<div class="slai-slide" data-slide-number="1">' +
        '<img data-slai-el="i1" data-slai-el-type="image" src="https://evil.example/x.png" style="position:absolute;left:0px;top:0px;width:10px;height:10px;z-index:0;" />' +
        "</div>",
    );
    expect(parseLegacyDesignHtml(html)[0].elements).toHaveLength(0);
  });

  it("throws UnsupportedLegacyHtmlError for freeform AI-generated HTML with no design markers, instead of silently dropping its content", () => {
    const html = wrap('<div class="slai-slide" data-slide-number="1"><h1>Quarterly results</h1><p style="color:red">Freeform AI content</p></div>');
    expect(() => parseLegacyDesignHtml(html)).toThrow(UnsupportedLegacyHtmlError);
  });

  it("accepts a genuinely blank slide wrapper with no elements at all", () => {
    const html = wrap('<div class="slai-slide" data-slide-number="1"></div>');
    expect(parseLegacyDesignHtml(html)[0].elements).toHaveLength(0);
  });

  it("throws UnsupportedLegacyHtmlError when there are no recognized slide wrappers at all", () => {
    expect(() => parseLegacyDesignHtml(wrap("<div>not a slide document</div>"))).toThrow(UnsupportedLegacyHtmlError);
  });

  it("throws UnsupportedLegacyHtmlError on non-contiguous slide numbering", () => {
    const html = wrap('<div class="slai-slide" data-slide-number="1"></div><div class="slai-slide" data-slide-number="3"></div>');
    expect(() => parseLegacyDesignHtml(html)).toThrow(UnsupportedLegacyHtmlError);
  });
});
