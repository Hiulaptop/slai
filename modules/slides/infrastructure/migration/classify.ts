import type { Prisma } from "../../../../generated/prisma/client";
import { CURRENT_ANIMATION_REGISTRY_VERSION } from "../../domain/structured/animation-registry";
// Side-effect import: registers the initial element definitions - see
// graph-validator.ts's identical import for why this can't rely on some
// other module having imported it first.
import { flattenWireSlides } from "../../domain/structured/compose";
import { validateStructuredCommand } from "../../domain/structured/graph-validator";
import { parseLegacyDesignHtml, UnsupportedLegacyHtmlError } from "./legacy-design-parser";

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

// Dry-run only (see design.md's migration plan stage 3): reads existing rows
// and parses HTML in memory, but writes nothing. A generation only reaches
// "convertible" after its parsed content also survives full structured
// validation (registered types, prop schemas, geometry, depth, reachability)
// - a syntactically parseable but semantically invalid legacy document is
// still classified "unsupported", never silently coerced.
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
    const wireSlides = parseLegacyDesignHtml(generation.htmlContent!);
    const flattened = flattenWireSlides(wireSlides, CURRENT_ANIMATION_REGISTRY_VERSION, "INVALID_INPUT");
    validateStructuredCommand(flattened.nodes, flattened.children, flattened.slides);
    return { generationId: generation.id, title: generation.title, provider: generation.provider, disposition: "convertible", slideCount: wireSlides.length };
  } catch (error) {
    const reason = error instanceof UnsupportedLegacyHtmlError || error instanceof Error ? error.message : "Unknown parsing failure";
    return { generationId: generation.id, title: generation.title, provider: generation.provider, disposition: "unsupported", reason };
  }
}
