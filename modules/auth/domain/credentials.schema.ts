import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .email("A valid email is required")
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Password must contain at least 8 characters")
  .max(128, "Password must contain at most 128 characters");

export const credentialsSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export type Credentials = z.infer<typeof credentialsSchema>;
