import { z } from "zod";

export const outlineSlideSchema = z
  .object({
    number: z.number().int().min(1).max(50),
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(2_000),
  })
  .strict();

export const outlineSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    slides: z.array(outlineSlideSchema).min(1).max(50),
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

export const batchEditSchema = z
  .object({
    generationId: z.uuid(),
    edits: z
      .array(
        z
          .object({
            slideNumber: z.number().int().min(1).max(50),
            prompt: z.string().trim().min(1).max(2_000),
          })
          .strict(),
      )
      .min(1)
      .max(50),
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
            slideNumber: z.number().int().min(1).max(50),
            html: z.string().min(1),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict();

export const generationIdSchema = z.uuid();
