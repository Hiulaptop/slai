import { createHash } from "node:crypto";

import type { SlideDocument } from "../../domain/structured/types";

// Deterministic content hashing is what makes structural sharing automatic
// (see prisma/schema.prisma's comment on the slide_snapshots model):
// identical (html, css) always hashes identically, so the repository can
// look up "does this already exist for this generation?" before inserting.

export function hashSlide(slide: Pick<SlideDocument, "html" | "css">): string {
  return createHash("sha256").update(JSON.stringify([slide.html, slide.css])).digest("hex");
}
