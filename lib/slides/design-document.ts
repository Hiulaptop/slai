// Client-side helpers for the GrapesJS-backed slide canvas. Slides are now
// plain per-slide HTML/CSS (see modules/slides/domain/structured/types.ts's
// SlideDocument) rather than a typed ElementNode scene graph, so this module
// only owns canvas sizing/bounds helpers and blank-document construction -
// the canvas itself loads/serializes HTML/CSS directly (see
// components/slide-html-canvas.tsx).

import type { SlideDocument } from "@/modules/slides/domain/structured/types";

export type { SlideDocument, StructuredRevision } from "@/modules/slides/domain/structured/types";
export type { WireSlide } from "@/modules/slides/domain/structured/compose";

export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;

export function createBlankSlide(number: number): SlideDocument {
  return { number, html: "", css: "" };
}

export function createBlankDocument(slideCount: number): SlideDocument[] {
  const count = Math.max(1, Math.min(50, Math.trunc(slideCount) || 1));
  return Array.from({ length: count }, (_, index) => createBlankSlide(index + 1));
}

export function renumberSlides(slides: SlideDocument[]): SlideDocument[] {
  return slides.map((slide, index) => (slide.number === index + 1 ? slide : { ...slide, number: index + 1 }));
}

export function toWireSlides(slides: SlideDocument[]): SlideDocument[] {
  return renumberSlides(slides);
}
