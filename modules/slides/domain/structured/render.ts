import { SlideError } from "../slide.errors";
import { animationRegistry } from "./animation-registry";
import { elementRegistry, type RenderContext, type RenderNode } from "./element-registry";
// Side-effect import: registers the initial element definitions into the
// singleton registry above - see graph-validator.ts's identical import for
// why this can't rely on some other module having imported it first.
import "./elements";
import { classNameForColor, classNameForFontSize } from "./tailwind-whitelist";
import type { ElementNode, Geometry, SlideDocument, StructuredRevision } from "./types";

// Pure string-templating renderer: no DOMParser, no browser globals, so this
// runs identically in Node (server preview/download) and the browser
// (editor live preview) - see design.md's "Render HTML on demand from
// validated structured data". Every user-controlled string passes through
// escapeHtml before landing in the output; animation CSS is application-
// owned (registry-defined, never user input) and is embedded verbatim.

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SAFE_CSS_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([0-9.,%\s]+\)|hsla?\([0-9.,%\s]+\)|[a-zA-Z]{3,20})$/;

function safeColor(value: unknown, fallback: string): string {
  return typeof value === "string" && SAFE_CSS_COLOR.test(value) ? value : fallback;
}

const VOID_TAGS = new Set(["img", "br", "hr", "line", "circle", "rect", "path", "polygon", "polyline"]);

function serializeStyle(style: Record<string, string | number> | undefined): string {
  if (!style) return "";
  const entries = Object.entries(style).filter(([, value]) => value !== undefined && value !== null && value !== "");
  return entries.map(([key, value]) => `${key}:${value}`).join(";");
}

function serializeRenderNode(node: RenderNode): string {
  const attrs: string[] = [];
  for (const [key, value] of Object.entries(node.attrs ?? {})) {
    attrs.push(`${key}="${escapeHtml(value)}"`);
  }
  const styleText = serializeStyle(node.style);
  if (styleText) attrs.push(`style="${escapeHtml(styleText)}"`);
  const attrText = attrs.length ? ` ${attrs.join(" ")}` : "";
  const hasContent = node.text !== undefined || (node.children?.length ?? 0) > 0;
  if (VOID_TAGS.has(node.tag) && !hasContent) return `<${node.tag}${attrText}/>`;
  const inner = (node.text !== undefined ? escapeHtml(node.text) : "") + (node.children ?? []).map(serializeRenderNode).join("");
  return `<${node.tag}${attrText}>${inner}</${node.tag}>`;
}

function geometryStyle(geometry: Geometry): Record<string, string> {
  const hasAny = geometry.x !== null || geometry.y !== null || geometry.width !== null || geometry.height !== null || geometry.zIndex !== null;
  if (!hasAny) return {};
  const style: Record<string, string> = { position: "absolute" };
  if (geometry.x !== null) style.left = `${geometry.x}px`;
  if (geometry.y !== null) style.top = `${geometry.y}px`;
  if (geometry.width !== null) style.width = `${geometry.width}px`;
  if (geometry.height !== null) style.height = `${geometry.height}px`;
  if (geometry.zIndex !== null) style["z-index"] = String(geometry.zIndex);
  return style;
}

// Animation is applied uniformly to every node's RenderNode here (not by
// individual element definitions - see element-registry.ts's RenderContext
// doc comment), by re-implementing the registry's recursive render() call so
// this cross-cutting wrapping reaches every level of the tree, not only the
// top-level elements passed in by the caller.
//
// `tailwindClasses`, when passed, is the additive Tailwind-class output mode
// (see design.md's "Render output has two modes" in
// openspec/changes/add-tailwind-text-styling/): a text element's fontSize/
// color get a regenerated Tailwind class added to `class`, alongside - never
// instead of - the inline style every element already gets. `undefined`
// (the default, used by `renderStructuredRevision`) leaves output identical
// to before this mode existed.
function renderElementNode(node: ElementNode, animationRegistryVersion: number, animationClasses: Map<string, string>, tailwindClasses?: Set<string>): RenderNode {
  const definition = elementRegistry.require(node.type, node.schemaVersion);
  const context: RenderContext = {
    animationRegistryVersion,
    renderChild: (child) => renderElementNode(child, animationRegistryVersion, animationClasses, tailwindClasses),
  };
  const base = definition.render(context, node as ElementNode & { props: unknown });

  const style: Record<string, string | number> = { ...(base.style ?? {}), ...geometryStyle(node.geometry) };
  const attrs: Record<string, string> = { ...(base.attrs ?? {}) };

  if (node.animation) {
    const resolved = animationRegistry.resolve(animationRegistryVersion, node.animation.key, node.animation.props);
    animationClasses.set(resolved.className, resolved.keyframesCss);
    attrs.class = attrs.class ? `${attrs.class} ${resolved.className}` : resolved.className;
    attrs["data-slai-anim"] = "true";
    style["animation-duration"] = `${resolved.durationMs}ms`;
    style["animation-delay"] = `${resolved.delayMs}ms`;
  }

  if (tailwindClasses && node.type === "text") {
    const props = node.props as { fontSize?: unknown; color?: unknown };
    const nodeClasses: string[] = [];
    if (typeof props.fontSize === "number") nodeClasses.push(classNameForFontSize(props.fontSize));
    if (typeof props.color === "string") nodeClasses.push(classNameForColor(props.color));
    for (const className of nodeClasses) tailwindClasses.add(className);
    if (nodeClasses.length) attrs.class = attrs.class ? `${attrs.class} ${nodeClasses.join(" ")}` : nodeClasses.join(" ");
  }

  return {
    ...base,
    attrs: Object.keys(attrs).length ? attrs : undefined,
    style: Object.keys(style).length ? style : undefined,
  };
}

function renderSlideMarkup(slide: SlideDocument, animationRegistryVersion: number, active: boolean, animationClasses: Map<string, string>, tailwindClasses?: Set<string>): string {
  const background = safeColor(slide.props.backgroundColor, "#ffffff");
  const style = `position:relative;width:${slide.width}px;height:${slide.height}px;background:${background};overflow:hidden;margin:0 auto;flex:none;`;
  const children = slide.elements.map((element) => serializeRenderNode(renderElementNode(element, animationRegistryVersion, animationClasses, tailwindClasses))).join("");
  const activeAttr = active ? ' data-slai-active="true"' : "";
  return `<div class="slai-slide" data-slide-number="${slide.number}"${activeAttr} style="${style}">${children}</div>`;
}

const DOCUMENT_CSS =
  "*{box-sizing:border-box}html,body{margin:0;padding:0;background:#111113;font-family:system-ui,-apple-system,'Segoe UI',sans-serif}" +
  ".slai-deck{position:relative;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}";

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
  function replay(slide) {
    if (!slide) return;
    slide.querySelectorAll('[data-slai-anim="true"]').forEach((el) => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = '';
    });
  }
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
    replay(slides[index]);
  }
  if (previous) previous.addEventListener('click', () => show(index - 1));
  if (next) next.addEventListener('click', () => show(index + 1));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });
  show(0);
})();`;

function buildAnimationClassCss(animationClasses: Map<string, string>): string {
  const rules = Array.from(animationClasses.keys()).map(
    (className) => `.${className}{animation-name:${className};animation-fill-mode:both;animation-timing-function:ease}`,
  );
  return rules.join("");
}

function buildDocument(revision: StructuredRevision, tailwindClasses?: Set<string>): string {
  if (!revision.slides.length) throw new SlideError("RENDER_FAILED", "Structured revision has no slides");
  const animationClasses = new Map<string, string>();
  const slidesHtml = revision.slides
    .map((slide, index) => renderSlideMarkup(slide, revision.animationRegistryVersion, index === 0, animationClasses, tailwindClasses))
    .join("");
  const keyframesCss = Array.from(animationClasses.values()).join("");
  const animationClassCss = buildAnimationClassCss(animationClasses);
  const style = `${DOCUMENT_CSS}${NAV_CSS}${keyframesCss}${animationClassCss}`;
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

// Produces one complete, dependency-free standalone HTML document (used for
// both authenticated preview and attachment download - see design.md's
// "Should structured detail and rendered preview share one endpoint"). Never
// writes the result anywhere; the caller decides whether to return it inline
// or as an attachment. Every element's fontSize/color-bearing style stays
// plain inline CSS - no Tailwind classes, no compile step - unaffected by
// the Tailwind-class output mode below; see that mode's own doc comment for
// why the two are kept separate.
export function renderStructuredRevision(revision: StructuredRevision): string {
  try {
    return buildDocument(revision);
  } catch (error) {
    throw new SlideError("RENDER_FAILED", "Unable to render structured revision", { cause: error });
  }
}

// Additive Tailwind-class output mode (see design.md's "Render output has
// two modes" in openspec/changes/add-tailwind-text-styling/): identical
// output to `renderStructuredRevision` except every text element's
// fontSize/color also gets a regenerated whitelisted Tailwind class in
// `class`, alongside its existing inline style. Returns the deduped list of
// classes actually used so a caller can compile a real stylesheet for them
// (see modules/slides/infrastructure/structured/tailwind-compiler.ts) -
// this function itself never invokes Tailwind or does any I/O, staying a
// pure, synchronous, testable string transform like the rest of this file.
// Scoped to the render/download route handlers only (see those routes) -
// every other caller (e.g. the design editor's own live preview) keeps
// using the plain `renderStructuredRevision` above.
export function renderStructuredRevisionWithTailwindClasses(revision: StructuredRevision): { html: string; tailwindClasses: string[] } {
  try {
    const tailwindClasses = new Set<string>();
    const html = buildDocument(revision, tailwindClasses);
    return { html, tailwindClasses: Array.from(tailwindClasses) };
  } catch (error) {
    throw new SlideError("RENDER_FAILED", "Unable to render structured revision", { cause: error });
  }
}
