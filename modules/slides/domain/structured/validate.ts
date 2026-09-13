import { SlideError } from "../slide.errors";
import { MAX_SLIDES_PER_DOCUMENT, type SlideDocument } from "./types";

// Structural validation for a set of per-slide HTML/CSS documents - the
// HTML/CSS-era counterpart of the prior element-graph validator, minus any
// graph topology concern (there is no node/edge graph left to validate; see
// sanitize.ts for the content-safety checks that replace per-element schema
// validation).

export interface ValidateSlidesOptions {
  // A batch edit submits only the requested replacement slides, so that
  // command is a sparse subset of an existing deck, not a contiguous 1..N
  // document. Full-document commands (bootstrap, save, AI generation) keep
  // the stricter contiguous-from-one check by default.
  requireContiguousFromOne?: boolean;
}

function fail(message: string): never {
  throw new SlideError("INVALID_INPUT", message);
}

export function validateStructuredCommand(slides: SlideDocument[], options: ValidateSlidesOptions = {}): void {
  const requireContiguousFromOne = options.requireContiguousFromOne ?? true;
  if (!slides.length) fail("A presentation must contain at least one slide");
  if (slides.length > MAX_SLIDES_PER_DOCUMENT) fail(`A presentation cannot exceed ${MAX_SLIDES_PER_DOCUMENT} slides`);

  const numbers = new Set<number>();
  slides.forEach((slide, index) => {
    if (requireContiguousFromOne && slide.number !== index + 1) fail("Slide numbers must be contiguous and one-based");
    if (!requireContiguousFromOne && (slide.number < 1 || slide.number > MAX_SLIDES_PER_DOCUMENT)) fail(`Slide number ${slide.number} is out of range`);
    if (numbers.has(slide.number)) fail(`Duplicate slide number: ${slide.number}`);
    numbers.add(slide.number);
  });
}
