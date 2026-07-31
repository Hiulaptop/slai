import { z } from "zod";

export const responseFormatSchema = z.enum(["text", "json_object"]);

export type ResponseFormat = z.infer<typeof responseFormatSchema>;

export const mediaTypeSchema = z
  .string()
  .trim()
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*$/,
    "Invalid media type",
  );

const nonEmptyTextSchema = z
  .string()
  .min(1, "Text is required")
  .refine(
    (value) => value.trim().length > 0,
    "Text cannot contain only whitespace",
  );

export const base64MediaSourceSchema = z
  .object({
    kind: z.literal("base64"),

    mediaType: mediaTypeSchema,

    data: z.string().trim().min(1, "Base64 data is required"),
  })
  .strict();

export type Base64MediaSource = z.infer<typeof base64MediaSourceSchema>;

export const textContentPartSchema = z
  .object({
    type: z.literal("text"),

    text: nonEmptyTextSchema,
  })
  .strict();

export type TextContentPart = z.infer<typeof textContentPartSchema>;

export const fileContentPartSchema = z
  .object({
    type: z.literal("file"),

    filename: z.string().trim().min(1, "Filename is required"),

    source: base64MediaSourceSchema,
  })
  .strict();

export type FileContentPart = z.infer<typeof fileContentPartSchema>;

export const domainContentPartSchema = z.discriminatedUnion("type", [
  textContentPartSchema,
  fileContentPartSchema,
]);

export type DomainContentPart = z.infer<typeof domainContentPartSchema>;
export const messageContentSchema = z.union([
  nonEmptyTextSchema,

  z
    .array(domainContentPartSchema)
    .min(1, "At least one content part is required"),
]);

export type MessageContent = z.infer<typeof messageContentSchema>;

export const messageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant"]),

    content: messageContentSchema,
  })
  .strict();

export type Message = z.infer<typeof messageSchema>;

export const requestSchema = z
  .object({
    modelId: z.string().trim().min(1, "Model ID is required"),

    messages: z.array(messageSchema).min(1, "At least one message is required"),

    temperature: z.number().min(0).max(2).default(1),

    maxOutputTokens: z.number().int().positive().optional(),
  })
  .strict();

export type AIRequest = z.infer<typeof requestSchema>;
