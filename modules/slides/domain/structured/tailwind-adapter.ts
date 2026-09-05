import { SlideError, type SlideErrorCode } from "../slide.errors";
import { resolveTailwindTextClass } from "./tailwind-whitelist";
import type { WireElement, WireSlide } from "./compose";

// Resolves a text element's fontSize/color when authored as a Tailwind
// class instead of an already-resolved value - see design.md's "Resolution
// happens once, in flattenWireSlides, before persistence". A string value is
// only ever treated as a class reference when it carries the `text-` prefix
// every whitelisted pattern uses (see tailwind-whitelist.ts); anything else
// (a number, or a string that is already a raw color like "#ff0000") passes
// through unchanged, which is what lets the same resolution pass run
// unconditionally for both AI-authored (class-based) and editor-authored
// (already-resolved) content without needing to know which caller it is.
function resolveTextValue(value: unknown, expectedKind: "fontSize" | "color", label: string, errorCode: SlideErrorCode): unknown {
  if (typeof value !== "string" || !value.startsWith("text-")) return value;
  const resolved = resolveTailwindTextClass(value);
  if (!resolved || resolved.kind !== expectedKind) {
    throw new SlideError(errorCode, `Unsupported Tailwind ${label} class: ${value}`);
  }
  return resolved.value;
}

// Resolves one text element's props in place (returns a new props object;
// does not mutate the input). Non-text elements and non-object props pass
// through unchanged.
export function resolveTextElementTailwindClasses(type: string, props: unknown, errorCode: SlideErrorCode): unknown {
  if (type !== "text" || typeof props !== "object" || props === null) return props;
  const source = props as Record<string, unknown>;
  const resolved: Record<string, unknown> = { ...source };
  if ("fontSize" in source) resolved.fontSize = resolveTextValue(source.fontSize, "fontSize", "font-size", errorCode);
  if ("color" in source) resolved.color = resolveTextValue(source.color, "color", "color", errorCode);
  return resolved;
}

function resolveElementTree(element: WireElement, errorCode: SlideErrorCode): WireElement {
  const props = resolveTextElementTailwindClasses(element.type, element.props, errorCode);
  const children = element.children?.map((child) => ({ ...child, element: resolveElementTree(child.element, errorCode) }));
  return { ...element, props, ...(children ? { children } : {}) };
}

// Whole-tree convenience wrapper for standalone use/testing - `compose.ts`
// itself calls `resolveTextElementTailwindClasses` inline during its own
// single walk (mirroring exactly how it already resolves animation
// references) rather than using this wrapper, to avoid walking the tree
// twice; this export exists for callers or tests that want the resolution
// pass in isolation from flattening.
export function resolveTailwindTextClasses(slides: WireSlide[], errorCode: SlideErrorCode): WireSlide[] {
  return slides.map((slide) => ({
    ...slide,
    elements: slide.elements.map((element) => resolveElementTree(element, errorCode)),
  }));
}
