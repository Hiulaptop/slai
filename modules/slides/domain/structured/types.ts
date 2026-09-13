// Per-slide HTML/CSS document model (adopt-grapesjs-html-canvas-editor).
// Replaces the prior typed ElementNode graph: a slide's content is now the
// sanitized HTML/CSS a GrapesJS canvas (or the AI) produced directly, not a
// node/edge graph the domain validates against a registry. Persistence still
// content-addresses each slide (see modules/slides/infrastructure/structured)
// so structural sharing across revisions works the same way it did for the
// element graph, just keyed on (html, css) instead of graph shape.

export interface SlideDocument {
  number: number;
  html: string;
  css: string;
}

export interface StructuredRevision {
  slides: SlideDocument[];
}

export const MAX_SLIDES_PER_DOCUMENT = 50;
export const MAX_HTML_BYTES_PER_SLIDE = 200_000;
export const MAX_CSS_BYTES_PER_SLIDE = 100_000;
