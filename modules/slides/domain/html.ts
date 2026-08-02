import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

import { SlideError } from "./slide.errors";

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const SLIDE_SELECTOR = "div.slai-slide[data-slide-number]";
const ACTIVE_CONTENT = /<\s*(script|iframe|object|embed|form)\b|\son[a-z]+\s*=|javascript\s*:|expression\s*\(/i;
const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
  "html", "head", "body", "style", "section", "article", "main", "header", "footer",
  "figure", "figcaption", "svg", "path", "circle", "rect", "line", "polyline", "polygon",
]);

function clean(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      "*": ["class", "id", "style", "title", "aria-*", "data-*"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      svg: ["viewBox", "width", "height", "fill", "stroke"],
      path: ["d", "fill", "stroke"],
    },
    allowedSchemes: ["http", "https", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
  });
}

function assertSize(html: string): void {
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned oversized HTML");
  }
}

export function validatePresentationHtml(html: string, slideCount: number): string {
  if (/^\s*```/.test(html) || ACTIVE_CONTENT.test(html) || !/<html[\s>]/i.test(html) || !/<head[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned invalid presentation HTML");
  }
  const sanitized = clean(html);
  assertSize(sanitized);
  const $ = cheerio.load(sanitized);
  const slides = $(SLIDE_SELECTOR).toArray();
  if (slides.length !== slideCount) throwInvalidHtml();
  slides.forEach((slide, index) => {
    if ($(slide).parents(SLIDE_SELECTOR).length || $(slide).attr("data-slide-number") !== String(index + 1)) throwInvalidHtml();
  });
  return $.html();
}

export function validateReplacementHtml(html: string, slideNumber: number): string {
  if (ACTIVE_CONTENT.test(html) || /<html[\s>]|<head[\s>]|<body[\s>]/i.test(html)) throwInvalidHtml();
  const sanitized = clean(html);
  const $ = cheerio.load(sanitized, null, false);
  const slides = $(SLIDE_SELECTOR).toArray();
  if (slides.length !== 1 || $.root().children().length !== 1 || $(slides[0]).attr("data-slide-number") !== String(slideNumber)) throwInvalidHtml();
  return $.html(slides[0]);
}

export function extractSlides(html: string, numbers: number[]): Record<number, string> {
  const $ = cheerio.load(html);
  const result: Record<number, string> = {};
  numbers.forEach((number) => {
    const node = $(`${SLIDE_SELECTOR}[data-slide-number="${number}"]`).first();
    if (!node.length) throw new SlideError("NOT_FOUND", "Slide not found");
    result[number] = $.html(node);
  });
  return result;
}

export function replaceSlides(html: string, replacements: Map<number, string>): string {
  const $ = cheerio.load(html);
  const before = new Map<number, string>();
  $(SLIDE_SELECTOR).each((_, node) => {
    const number = Number($(node).attr("data-slide-number"));
    if (!replacements.has(number)) before.set(number, $.html(node));
  });
  replacements.forEach((replacement, number) => {
    const target = $(`${SLIDE_SELECTOR}[data-slide-number="${number}"]`).first();
    if (!target.length) throw new SlideError("NOT_FOUND", "Slide not found");
    target.replaceWith(replacement);
  });
  before.forEach((value, number) => {
    const node = $(`${SLIDE_SELECTOR}[data-slide-number="${number}"]`).first();
    if (!node.length || $.html(node) !== value) throwInvalidHtml();
  });
  const result = $.html();
  assertSize(result);
  return result;
}

function throwInvalidHtml(): never {
  throw new SlideError("INVALID_MODEL_OUTPUT", "AI returned invalid slide HTML");
}
