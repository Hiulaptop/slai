import sanitizeHtml from "sanitize-html";

import { SlideError, type SlideErrorCode } from "../slide.errors";
import { MAX_CSS_BYTES_PER_SLIDE, MAX_HTML_BYTES_PER_SLIDE } from "./types";

// Content-safety boundary for directly authored slide HTML/CSS (from the
// GrapesJS canvas or an AI response) - see openspec/changes/
// adopt-grapesjs-html-canvas-editor's structured-slide-document delta's
// "Deterministic render on demand" and slide-html-canvas-editor's "Save
// produces sanitized per-slide HTML" requirements. Runs on write AND
// defensively again on render, so a row that predates a tightened rule still
// fails closed instead of serving unsafe output.

const ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat([
  "section", "article", "header", "footer", "figure", "figcaption", "span", "div",
  "svg", "path", "circle", "rect", "line", "polyline", "polygon", "g", "defs", "linearGradient", "stop",
]);

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions["allowedAttributes"] = {
  "*": ["class", "id", "style", "title", "aria-*", "data-*"],
  a: ["href", "target", "rel"],
  img: ["src", "alt", "width", "height"],
  svg: ["viewBox", "width", "height", "fill", "stroke", "xmlns"],
  path: ["d", "fill", "stroke"],
  linearGradient: ["id", "x1", "y1", "x2", "y2"],
  stop: ["offset", "stop-color", "stop-opacity"],
};

// Matches sanitize-html's own defaults (disallowedTagsMode "discard" and
// script/style/on* stripped by omission from ALLOWED_TAGS/ALLOWED_ATTRIBUTES)
// but is asserted explicitly here so a future sanitize-html default change
// can't silently reopen this.
export function sanitizeSlideHtml(html: string, errorCode: SlideErrorCode): string {
  if (Buffer.byteLength(html, "utf-8") > MAX_HTML_BYTES_PER_SLIDE) {
    throw new SlideError(errorCode, "Slide HTML exceeds the maximum size");
  }
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
  });
}

const UNSAFE_CSS = /@import\b|url\s*\(\s*['"]?\s*javascript\s*:|expression\s*\(|<\s*\/?\s*script/i;

export function sanitizeSlideCss(css: string, errorCode: SlideErrorCode): string {
  if (Buffer.byteLength(css, "utf-8") > MAX_CSS_BYTES_PER_SLIDE) {
    throw new SlideError(errorCode, "Slide CSS exceeds the maximum size");
  }
  if (UNSAFE_CSS.test(css)) {
    throw new SlideError(errorCode, "Slide CSS contains disallowed content");
  }
  return css;
}
