import type { FileContentPart } from "../../ai/domain/request.schema";
import { SlideError } from "./slide.errors";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const REPORT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.oasis.opendocument.text",
]);
const TEMPLATE_TYPES = new Set([
  "text/html",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export type UploadKind = "report" | "template";

export async function toFilePart(file: File, kind: UploadKind): Promise<FileContentPart> {
  const allowed = kind === "report" ? REPORT_TYPES : TEMPLATE_TYPES;
  if (!file.name.trim() || file.size < 1 || file.size > MAX_FILE_BYTES || !allowed.has(file.type)) {
    throw new SlideError("INVALID_INPUT", `Invalid ${kind} file`);
  }

  return {
    type: "file",
    filename: file.name,
    source: {
      kind: "base64",
      mediaType: file.type,
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    },
  };
}

export function fileMetadata(file: File) {
  return { filename: file.name, mediaType: file.type, size: file.size };
}
