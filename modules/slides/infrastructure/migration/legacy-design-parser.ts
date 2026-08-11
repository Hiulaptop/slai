import * as cheerio from "cheerio";

import type { WireElement, WireSlide } from "../../domain/structured/compose";

type CheerioElement = ReturnType<cheerio.CheerioAPI>[number];

// Parses the OLD visual-editor HTML marker format (data-slai-el/data-slai-el-type
// with inline position styles - see the deleted lib/slides/design-document.ts's
// serializeDesignDocument, git history of add-visual-slide-design-editor) into
// the new structured wire shape. This is read-only classification/backfill
// tooling (see design.md's migration plan stage 3): it never mutates the
// source row, and never runs on AI-generated decks, which never used these
// markers and are inherently unsupported for lossless conversion (see
// design.md's "Arbitrary legacy AI HTML may not map losslessly").

const SLIDE_SELECTOR = "div.slai-slide[data-slide-number]";
const ALLOWED_IMAGE_SRC = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;

export class UnsupportedLegacyHtmlError extends Error {}

function styleNumber(style: string, property: string): number {
  const match = style.match(new RegExp(`${property}\\s*:\\s*(-?[\\d.]+)px`));
  return match ? parseFloat(match[1]) : 0;
}

function styleZIndex(style: string): number {
  const match = style.match(/z-index\s*:\s*(-?\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function asAlign(value: string | undefined): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function parseLegacyElement($: cheerio.CheerioAPI, node: CheerioElement): WireElement | null {
  const el = $(node);
  const type = el.attr("data-slai-el-type");
  const style = el.attr("style") ?? "";
  const geometry = {
    x: styleNumber(style, "left"),
    y: styleNumber(style, "top"),
    width: styleNumber(style, "width"),
    height: styleNumber(style, "height"),
    zIndex: styleZIndex(style),
  };

  switch (type) {
    case "text":
      return {
        type: "text",
        geometry,
        props: {
          text: el.text(),
          styleType: "body",
          fontSize: Number(el.attr("data-slai-font-size")) || 24,
          fontWeight: 400,
          color: el.attr("data-slai-color") || "#171713",
          backgroundColor: null,
          align: asAlign(el.attr("data-slai-align")),
          bold: false,
          italic: false,
          underline: false,
          list: "none",
        },
        animation: null,
      };
    case "rectangle":
    case "ellipse":
      return {
        type: "shape",
        geometry,
        props: { shapeType: type, fill: el.attr("data-slai-fill") || "#2448d8", stroke: el.attr("data-slai-stroke") || "#171713", strokeWidth: 2 },
        animation: null,
      };
    case "line":
      return {
        type: "shape",
        geometry,
        props: { shapeType: "line", fill: "transparent", stroke: el.attr("data-slai-stroke") || "#171713", strokeWidth: 2 },
        animation: null,
      };
    case "image": {
      const src = el.attr("src") ?? "";
      if (!ALLOWED_IMAGE_SRC.test(src)) return null;
      return { type: "image", geometry, props: { src, alt: el.attr("alt") ?? "" }, animation: null };
    }
    default:
      return null;
  }
}

// Throws UnsupportedLegacyHtmlError (never returns a partial/best-effort
// result) whenever the source cannot be represented losslessly - callers
// classify that as "unsupported", never as a silently-lossy conversion.
export function parseLegacyDesignHtml(html: string): WireSlide[] {
  const $ = cheerio.load(html);
  const wrappers = $(SLIDE_SELECTOR).toArray();
  if (!wrappers.length) throw new UnsupportedLegacyHtmlError("No recognized design-marker slide wrappers found");

  return wrappers.map((wrapper, index) => {
    const number = Number($(wrapper).attr("data-slide-number"));
    if (!Number.isInteger(number) || number !== index + 1) {
      throw new UnsupportedLegacyHtmlError("Non-contiguous slide numbering");
    }
    const elements = $(wrapper)
      .find("[data-slai-el]")
      .toArray()
      .map((node) => parseLegacyElement($, node))
      .filter((element): element is WireElement => element !== null);
    if (hasUnaccountedContent($, wrapper)) {
      throw new UnsupportedLegacyHtmlError("Slide contains content outside recognized design markers (likely freeform AI-generated HTML)");
    }
    return { number, width: 960, height: 540, elements };
  });
}

// A slide wrapper that used the design-marker format has nothing left once
// every [data-slai-el] node is removed. A slide with leftover text or
// elements - most commonly freeform AI-generated markup, which never used
// these markers at all - would silently lose that content if converted, so
// it must be classified unsupported instead (see the module doc comment's
// "MUST NOT silently discard content that cannot be converted losslessly").
function hasUnaccountedContent($: cheerio.CheerioAPI, wrapper: CheerioElement): boolean {
  const clone = $(wrapper).clone();
  clone.find("[data-slai-el]").remove();
  return clone.text().trim().length > 0 || clone.find("*").length > 0;
}
