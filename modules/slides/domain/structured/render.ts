import { SlideError } from "../slide.errors";
import { sanitizeSlideCss, sanitizeSlideHtml } from "./sanitize";
import type { SlideDocument, StructuredRevision } from "./types";

// Pure string-templating assembler: no DOMParser, no browser globals, so this
// runs identically in Node (server preview/download) and the browser
// (canvas live preview). Every slide's HTML/CSS was already sanitized on
// write (see infrastructure/structured/write.ts); this re-sanitizes
// defensively so a row that predates a tightened rule still fails closed
// instead of serving unsafe output (structured-slide-document's "Render
// malformed stored structure" requirement).

function renderSlideMarkup(slide: SlideDocument, active: boolean): string {
  const html = sanitizeSlideHtml(slide.html, "RENDER_FAILED");
  const activeAttr = active ? ' data-slai-active="true"' : "";
  return `<div class="slai-slide" data-slide-number="${slide.number}"${activeAttr}>${html}</div>`;
}

const DOCUMENT_CSS =
  "*{box-sizing:border-box}html,body{margin:0;padding:0;background:#111113;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}" +
  ".slai-deck{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}" +
  ".slai-slide{position:relative;width:960px;height:540px;background:#ffffff;overflow:hidden;margin:0 auto;flex:none}";

const NAV_CSS =
  '.slai-slide{display:none}.slai-slide[data-slai-active="true"]{display:block}' +
  ".slai-export-nav{position:fixed;z-index:2147483647;right:20px;bottom:20px;display:flex;align-items:center;gap:8px;padding:8px;border-radius:999px;background:rgba(17,24,39,.88);color:#fff;font:600 14px/1 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.28)}" +
  ".slai-export-nav button{appearance:none;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:#fff;color:#111827;padding:9px 14px;font:inherit;cursor:pointer}" +
  ".slai-export-nav button:disabled{cursor:not-allowed;opacity:.42}.slai-export-counter{min-width:72px;text-align:center}" +
  '@media print{.slai-export-nav{display:none!important}.slai-slide{display:block!important;break-after:page}.slai-deck{padding:0;min-height:0}}';

const NAV_SCRIPT = `(() => {
  const slides = Array.from(document.querySelectorAll('.slai-slide'));
  const previous = document.querySelector('[data-slai-export-previous]');
  const next = document.querySelector('[data-slai-export-next]');
  const counter = document.querySelector('[data-slai-export-counter]');
  let index = 0;
  function show(nextIndex) {
    if (nextIndex < 0 || nextIndex >= slides.length) return;
    index = nextIndex;
    slides.forEach((slide, slideIndex) => {
      if (slideIndex === index) slide.setAttribute('data-slai-active', 'true');
      else slide.removeAttribute('data-slai-active');
    });
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === slides.length - 1;
    if (counter) counter.textContent = (index + 1) + ' / ' + slides.length;
  }
  if (previous) previous.addEventListener('click', () => show(index - 1));
  if (next) next.addEventListener('click', () => show(index + 1));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  show(0);
})();`;

function buildDocument(revision: StructuredRevision): string {
  if (!revision.slides.length) throw new SlideError("RENDER_FAILED", "Structured revision has no slides");
  const slidesHtml = revision.slides.map((slide, index) => renderSlideMarkup(slide, index === 0)).join("");
  const slidesCss = revision.slides.map((slide) => sanitizeSlideCss(slide.css, "RENDER_FAILED")).join("\n");
  const style = `${DOCUMENT_CSS}${NAV_CSS}${slidesCss}`;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Presentation</title>` +
    `<style>${style}</style></head><body><div class="slai-deck">${slidesHtml}</div>` +
    `<nav class="slai-export-nav" aria-label="Slide navigation">` +
    `<button type="button" data-slai-export-previous aria-label="Previous slide">Previous</button>` +
    `<span class="slai-export-counter" data-slai-export-counter aria-live="polite"></span>` +
    `<button type="button" data-slai-export-next aria-label="Next slide">Next</button></nav>` +
    `<script>${NAV_SCRIPT}</script></body></html>`
  );
}

// Produces one complete, dependency-free standalone HTML document, used for
// both authenticated preview and attachment download. Never writes the
// result anywhere; the caller decides whether to return it inline or as an
// attachment.
export function renderStructuredRevision(revision: StructuredRevision): string {
  try {
    return buildDocument(revision);
  } catch (error) {
    if (error instanceof SlideError) throw error;
    throw new SlideError("RENDER_FAILED", "Unable to render structured revision", { cause: error });
  }
}
