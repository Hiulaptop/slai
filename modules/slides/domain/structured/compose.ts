import { z } from "zod";

import { SlideError, type SlideErrorCode } from "../slide.errors";
import { animationRegistry } from "./animation-registry";
import { resolveTextElementTailwindClasses } from "./tailwind-adapter";
import type { AnimationReference, ElementChildCommand, ElementNodeCommand, Geometry, SlideCommand } from "./types";

// The wire shape authors (the AI adapter, and later the visual editor) work
// with is a natural nested tree, not the flat node+edge graph the domain
// validator and repository require - see types.ts's comment on why the
// persisted/validated shape is deliberately flat. This module is the single
// place that converts tree -> graph, assigning node IDs, so every caller
// (AI generation, AI batch edit, and eventually direct editor saves) gets
// identical flattening and identical animation-reference validation instead
// of re-implementing the walk per call site.

const geometrySchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().positive().max(4_000),
    height: z.number().positive().max(4_000),
    zIndex: z.number().int().min(0).max(1_000),
  })
  .strict();

const animationWireSchema = z
  .object({
    key: z.string().min(1).max(50),
    durationMs: z.number().int().min(0).max(10_000).optional(),
    delayMs: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()
  .nullable();

export interface WireElement {
  type: string;
  geometry?: z.infer<typeof geometrySchema> | null;
  props: unknown;
  animation?: z.infer<typeof animationWireSchema>;
  children?: { slotKey: string; element: WireElement }[];
}

const wireElementSchema: z.ZodType<WireElement> = z.lazy(() =>
  z
    .object({
      type: z.string().min(1).max(50),
      geometry: geometrySchema.nullable().optional(),
      props: z.unknown(),
      animation: animationWireSchema.optional(),
      children: z.array(z.object({ slotKey: z.string().min(1).max(50), element: wireElementSchema }).strict()).max(200).optional(),
    })
    .strict(),
);

export const wireSlideSchema = z
  .object({
    number: z.number().int().min(1),
    width: z.number().int().positive().max(4_000),
    height: z.number().int().positive().max(4_000),
    backgroundColor: z.string().max(64).optional(),
    elements: z.array(wireElementSchema).max(200),
  })
  .strict();

export type WireSlide = z.infer<typeof wireSlideSchema>;

// Shared response envelope for both AI generation and AI batch edit - a
// batch edit's replacements are just full replacement slides using the same
// wire shape, not a diff format (see prompts.ts's editSystemPrompt).
export const structuredSlidesResponseSchema = z
  .object({
    slides: z.array(wireSlideSchema).min(1).max(50),
  })
  .strict();

export type StructuredSlidesResponse = z.infer<typeof structuredSlidesResponseSchema>;

const NULL_GEOMETRY: Geometry = { x: null, y: null, width: null, height: null, zIndex: null };

function toAnimationReference(wire: WireElement["animation"]): AnimationReference | null {
  if (!wire) return null;
  return { key: wire.key, props: { durationMs: wire.durationMs, delayMs: wire.delayMs } };
}

export interface FlattenedDocument {
  nodes: ElementNodeCommand[];
  children: ElementChildCommand[];
  slides: SlideCommand[];
}

// `errorCode` lets each caller keep the right HTTP-mapping semantics for a
// malformed tree: AI output that fails to flatten is a provider fault
// (INVALID_MODEL_OUTPUT, maps to 502), while an editor-authored command that
// fails is a caller fault (INVALID_INPUT, maps to 400).
export function flattenWireSlides(slides: WireSlide[], animationRegistryVersion: number, errorCode: SlideErrorCode): FlattenedDocument {
  const nodes: ElementNodeCommand[] = [];
  const children: ElementChildCommand[] = [];
  let counter = 0;
  const nextId = () => `el-${counter++}`;

  function fail(message: string): never {
    throw new SlideError(errorCode, message);
  }

  function validateAnimation(element: WireElement): void {
    if (!element.animation) return;
    try {
      animationRegistry.resolve(animationRegistryVersion, element.animation.key, {
        durationMs: element.animation.durationMs,
        delayMs: element.animation.delayMs,
      });
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "Invalid animation reference");
    }
  }

  function place(element: WireElement, isTopLevel: boolean): string {
    if (isTopLevel && !element.geometry) fail("Top-level slide elements must include geometry");
    validateAnimation(element);
    let props: unknown;
    try {
      props = resolveTextElementTailwindClasses(element.type, element.props, errorCode);
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "Invalid Tailwind class reference");
    }
    const id = nextId();
    nodes.push({
      id,
      type: element.type,
      schemaVersion: 1,
      geometry: element.geometry ?? NULL_GEOMETRY,
      props,
      animation: toAnimationReference(element.animation),
    });
    (element.children ?? []).forEach((child, index) => {
      const childId = place(child.element, false);
      children.push({ parentId: id, childId, slotKey: child.slotKey, orderIndex: index });
    });
    return id;
  }

  const slideCommands: SlideCommand[] = slides.map((slide) => ({
    number: slide.number,
    width: slide.width,
    height: slide.height,
    props: slide.backgroundColor ? { backgroundColor: slide.backgroundColor } : {},
    topLevelElementIds: slide.elements.map((element) => place(element, true)),
  }));

  return { nodes, children, slides: slideCommands };
}
