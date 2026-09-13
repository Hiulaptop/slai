import type { Prisma } from "../../../../generated/prisma/client";
import { extractSlides, slideNumbers } from "../../domain/html";
import { validateStructuredCommand } from "../../domain/structured/validate";

export type ClassificationDisposition = "already-structured" | "convertible" | "unsupported";

export interface ClassificationResult {
  generationId: string;
  title: string | null;
  provider: string;
  disposition: ClassificationDisposition;
  reason?: string;
  slideCount?: number;
}

export type ClassifyClient = Pick<Prisma.TransactionClient, "slideGeneration" | "slideRevision" | "slideRevisionSlide">;

// Dry-run only: reads existing rows and extracts per-slide HTML in memory
// (via the same `.slai-slide[data-slide-number]` markers the legacy
// whole-document HTML pipeline already used - see domain/html.ts), but
// writes nothing. A generation only reaches "convertible" after its
// extracted slides also survive structural validation - a syntactically
// parseable but semantically invalid legacy document is still classified
// "unsupported", never silently coerced.
export async function classifyLegacyGenerations(client: ClassifyClient): Promise<ClassificationResult[]> {
  const generations = await client.slideGeneration.findMany({
    where: { status: "COMPLETED", htmlContent: { not: null }, currentRevisionNumber: { not: null } },
    select: { id: true, title: true, provider: true, htmlContent: true, currentRevisionNumber: true },
  });

  const results: ClassificationResult[] = [];
  for (const generation of generations) {
    results.push(await classifyOne(client, generation));
  }
  return results;
}

async function classifyOne(
  client: ClassifyClient,
  generation: { id: string; title: string | null; provider: string; htmlContent: string | null; currentRevisionNumber: number | null },
): Promise<ClassificationResult> {
  const currentRevision = await client.slideRevision.findUnique({
    where: { slideGenerationId_revisionNumber: { slideGenerationId: generation.id, revisionNumber: generation.currentRevisionNumber! } },
    select: { id: true },
  });
  const alreadyStructured = currentRevision
    ? await client.slideRevisionSlide.findFirst({ where: { slideRevisionId: currentRevision.id } })
    : null;
  if (alreadyStructured) {
    return { generationId: generation.id, title: generation.title, provider: generation.provider, disposition: "already-structured" };
  }

  try {
    const numbers = slideNumbers(generation.htmlContent!);
    if (!numbers.length) throw new Error("Legacy document has no slide markers");
    const extracted = extractSlides(generation.htmlContent!, numbers);
    const slides = numbers.map((number) => ({ number, html: extracted[number], css: "" }));
    validateStructuredCommand(slides, { requireContiguousFromOne: false });
    return { generationId: generation.id, title: generation.title, provider: generation.provider, disposition: "convertible", slideCount: numbers.length };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown parsing failure";
    return { generationId: generation.id, title: generation.title, provider: generation.provider, disposition: "unsupported", reason };
  }
}
