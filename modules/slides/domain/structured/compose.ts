import { z } from "zod";

import type { SlideErrorCode } from "../slide.errors";
import { sanitizeSlideCss, sanitizeSlideHtml } from "./sanitize";
import { MAX_SLIDES_PER_DOCUMENT, type SlideDocument } from "./types";

// Wire shape authors (the AI adapter, and the GrapesJS canvas) submit: one
// sanitized-on-write HTML/CSS pair per slide. Shared by AI generation, AI
// batch edit, and direct canvas-authored edits/saves - see prompts.ts's
// generation/edit system prompts and slide-html-canvas-editor's save
// requirement for why every caller uses this same shape.
export const wireSlideSchema = z
  .object({
    number: z.number().int().min(1),
    html: z.string().min(1),
    css: z.string().default(""),
  })
  .strict();

export type WireSlide = z.infer<typeof wireSlideSchema>;

// Shared response envelope for AI generation and AI batch edit.
export const structuredSlidesResponseSchema = z
  .object({
    slides: z.array(wireSlideSchema).min(1).max(MAX_SLIDES_PER_DOCUMENT),
  })
  .strict();

export type StructuredSlidesResponse = z.infer<typeof structuredSlidesResponseSchema>;

export interface FlattenedDocument {
  slides: SlideDocument[];
}

// `errorCode` lets each caller keep the right HTTP-mapping semantics for
// unsafe content: AI output that fails sanitization is a provider fault
// (INVALID_MODEL_OUTPUT, maps to 502), while directly submitted canvas
// content that fails is a caller fault (INVALID_INPUT, maps to 400).
export function flattenWireSlides(slides: WireSlide[], errorCode: SlideErrorCode): FlattenedDocument {
  return {
    slides: slides.map((slide) => ({
      number: slide.number,
      html: sanitizeSlideHtml(slide.html, errorCode),
      css: sanitizeSlideCss(slide.css, errorCode),
    })),
  };
}
