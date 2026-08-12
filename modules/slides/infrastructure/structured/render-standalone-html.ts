import { renderStructuredRevision, renderStructuredRevisionWithTailwindClasses } from "../../domain/structured/render";
import type { StructuredRevision } from "../../domain/structured/types";
import { compileTailwindStylesheet } from "./tailwind-compiler";

// Orchestrates the Tailwind-class render + compile pipeline for the
// render/download route handlers (see design.md's "Render output has two
// modes" in openspec/changes/add-tailwind-text-styling/): renders with
// Tailwind classes, compiles a real stylesheet for them, and embeds it in
// the document's <head>.
//
// If the compile step fails for any reason (e.g. the deployment environment
// cannot spawn the Tailwind CLI subprocess - a risk explicitly flagged in
// design.md/tasks.md 6.1), this degrades gracefully to the plain
// inline-style-only render instead of failing the request: every element's
// inline style already renders correctly on its own (see render.ts's
// Tailwind-class mode doc comment - classes are additive, never a
// replacement for inline style), so a missing compiled stylesheet is a lost
// nicety, not a broken page. This is not a security/validation fail-closed
// case - see render.ts's own `RENDER_FAILED` handling for that - so a
// softer fallback here is appropriate.
export async function renderStandaloneHtml(revision: StructuredRevision): Promise<string> {
  const { html, tailwindClasses } = renderStructuredRevisionWithTailwindClasses(revision);
  if (!tailwindClasses.length) return html;

  try {
    const stylesheet = await compileTailwindStylesheet(tailwindClasses);
    return stylesheet ? html.replace("</head>", `<style>${stylesheet}</style></head>`) : html;
  } catch {
    return renderStructuredRevision(revision);
  }
}
