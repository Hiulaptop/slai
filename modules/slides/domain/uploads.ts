import type { FileContentPart } from "../../ai/domain/request.schema";
import { SlideError } from "./slide.errors";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
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

const MEDIA_TYPES_BY_EXTENSION: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".html": "text/html",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".md": "text/markdown",
  ".odt": "application/vnd.oasis.opendocument.text",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

export type UploadKind = "report" | "template";

export async function toFilePart(file: File, kind: UploadKind): Promise<FileContentPart> {
  const allowed = kind === "report" ? REPORT_TYPES : TEMPLATE_TYPES;
  const mediaType = normalizedMediaType(file);
  if (!file.name.trim()) throw new SlideError("INVALID_INPUT", `${kind} file name is required`);
  if (file.size < 1) throw new SlideError("INVALID_INPUT", `${file.name} is empty`);
  if (file.size > MAX_FILE_BYTES) throw new SlideError("INVALID_INPUT", `${file.name} exceeds the 10 MiB file limit`);
  if (!allowed.has(mediaType)) {
    throw new SlideError("INVALID_INPUT", `${file.name} has an unsupported ${kind} file type`);
  }

  return {
    type: "file",
    filename: file.name,
    source: {
      kind: "base64",
      mediaType,
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    },
  };
}

export function fileMetadata(file: File) {
  return { filename: file.name, mediaType: normalizedMediaType(file), size: file.size };
}

export function normalizedMediaType(file: Pick<File, "name" | "type">): string {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  const supplied = file.type.toLowerCase().split(";", 1)[0].trim();
  if (supplied && supplied !== "application/octet-stream") return supplied;
  return extension ? MEDIA_TYPES_BY_EXTENSION[extension] ?? supplied : supplied;
}

export async function toFileParts(files: File[], kind: UploadKind): Promise<FileContentPart[]> {
  if (!files.length || files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BYTES) {
    throw new SlideError("INVALID_INPUT", `Invalid ${kind} files`);
  }
  return Promise.all(files.map((file) => toFilePart(file, kind)));
}

export function assertAggregateUpload(files: File[]): void {
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BYTES) {
    throw new SlideError("INVALID_INPUT", "Uploaded files exceed the aggregate limit");
  }
}

export function fileMetadataList(files: File[]) {
  return files.map(fileMetadata);
}
