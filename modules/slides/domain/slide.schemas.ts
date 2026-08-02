import { z } from "zod";

export const outlineSlideSchema = z
  .object({
    number: z.number().int().min(1),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const outlineSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    slides: z.array(outlineSlideSchema).min(1),
  })
  .strict()
  .superRefine((outline, context) => {
    outline.slides.forEach((slide, index) => {
      if (slide.number !== index + 1) {
        context.addIssue({
          code: "custom",
          path: ["slides", index, "number"],
          message: "Slide numbers must be contiguous and one-based",
        });
      }
    });
  });

export type SlideOutline = z.infer<typeof outlineSchema>;

export const creationMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    prompt: z.string().trim().min(1).max(4_000),
    slideCount: z.coerce.number().int().positive(),
  })
  .strict();

export type CreationMetadata = z.infer<typeof creationMetadataSchema>;

export function approvedOutlineSchema(slideCount: number) {
  return outlineSchema.refine((outline) => outline.slides.length === slideCount, {
    message: "Outline must match requested slide count",
    path: ["slides"],
  });
}

export const batchEditSchema = z
  .object({
    generationId: z.uuid(),
    edits: z
      .array(
        z
          .object({
            slideNumber: z.number().int().min(1),
            prompt: z.string().trim().min(1).max(2_000),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((input, context) => {
    const numbers = new Set<number>();
    input.edits.forEach((edit, index) => {
      if (numbers.has(edit.slideNumber)) {
        context.addIssue({
          code: "custom",
          path: ["edits", index, "slideNumber"],
          message: "Slide numbers must be unique",
        });
      }
      numbers.add(edit.slideNumber);
    });
  });

export type BatchEdit = z.infer<typeof batchEditSchema>;

export const editResponseSchema = z
  .object({
    slides: z
      .array(
        z
          .object({
            slideNumber: z.number().int().min(1),
            html: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export const generationIdSchema = z.uuid();

export const slideUndoSchema = z.object({ slideNumber: z.number().int().positive() }).strict();

export const presentationCursorSchema = z
  .object({
    createdAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
  })
  .strict();

export type PresentationCursor = z.infer<typeof presentationCursorSchema>;

export const presentationListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).optional(),
  })
  .strict();

export type PresentationListQuery = z.infer<typeof presentationListQuerySchema>;
