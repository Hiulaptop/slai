import type { Prisma } from "../../../../generated/prisma/client";
import { CURRENT_ANIMATION_REGISTRY_VERSION } from "../../domain/structured/animation-registry";
import { flattenWireSlides } from "../../domain/structured/compose";
import { validateStructuredCommand } from "../../domain/structured/graph-validator";
import { renderStructuredRevision } from "../../domain/structured/render";
import { loadStructuredRevision } from "../structured/graph-repository";
import { resolveStructuredSlides, writeStructuredRevision } from "../structured/write";
import { classifyLegacyGenerations, type ClassifyClient } from "./classify";
import { parseLegacyDesignHtml } from "./legacy-design-parser";

export type BackfillClient = ClassifyClient & Pick<Prisma.TransactionClient, "slideElementNode" | "slideElementChild" | "slideSnapshot" | "slideSnapshotElement">;

export interface BackfillResult {
  generationId: string;
  status: "migrated" | "skipped-already-structured" | "skipped-unsupported" | "failed-verification" | "failed-conflict";
  reason?: string;
}

// Idempotent: re-running only ever touches generations still classified
// "convertible" (see classify.ts - a generation with any structured
// composition on its current revision is "already-structured" and skipped),
// and content-addressed writes mean a retried migration of the same source
// HTML reuses existing rows rather than duplicating them. Every migrated
// generation is read back and re-rendered before being reported as
// "migrated" - see design.md's "verifies rendered output for converted
// records" - a rendering failure leaves the source row untouched (the CAS
// write already happened, but that is an additive structured revision, not
// a destructive change to the retained htmlContent) and is reported instead
// of silently accepted.
export async function backfillLegacyGenerations(client: BackfillClient): Promise<BackfillResult[]> {
  const classifications = await classifyLegacyGenerations(client);
  const results: BackfillResult[] = [];

  for (const classification of classifications) {
    if (classification.disposition === "already-structured") {
      results.push({ generationId: classification.generationId, status: "skipped-already-structured" });
      continue;
    }
    if (classification.disposition === "unsupported") {
      results.push({ generationId: classification.generationId, status: "skipped-unsupported", reason: classification.reason });
      continue;
    }
    results.push(await migrateOne(client, classification.generationId));
  }

  return results;
}

async function migrateOne(client: BackfillClient, generationId: string): Promise<BackfillResult> {
  const generation = await client.slideGeneration.findUniqueOrThrow({
    where: { id: generationId },
    select: { id: true, htmlContent: true, currentRevisionNumber: true, nextRevisionNumber: true },
  });
  if (generation.currentRevisionNumber === null || !generation.htmlContent) {
    return { generationId, status: "skipped-unsupported", reason: "No current revision or HTML to migrate" };
  }

  const wireSlides = parseLegacyDesignHtml(generation.htmlContent);
  const flattened = flattenWireSlides(wireSlides, CURRENT_ANIMATION_REGISTRY_VERSION, "INVALID_INPUT");
  validateStructuredCommand(flattened.nodes, flattened.children, flattened.slides);

  const slideSnapshotIdByNumber = await resolveStructuredSlides(client, generationId, flattened.nodes, flattened.children, flattened.slides);
  const revisionId = await writeStructuredRevision(client, {
    slideGenerationId: generationId,
    expectedCurrentRevisionNumber: generation.currentRevisionNumber,
    expectedNextRevisionNumber: generation.nextRevisionNumber,
    operation: "EDIT",
    editRequest: { kind: "legacy-backfill" },
    changedSlideNumbers: flattened.slides.map((slide) => slide.number),
    animationRegistryVersion: CURRENT_ANIMATION_REGISTRY_VERSION,
    slideSnapshotIdByNumber,
  });
  if (!revisionId) {
    return { generationId, status: "failed-conflict", reason: "Generation changed concurrently during backfill" };
  }

  try {
    const revision = await loadStructuredRevision(client, generationId, revisionId, CURRENT_ANIMATION_REGISTRY_VERSION);
    if (!revision || revision.slides.length !== flattened.slides.length) {
      return { generationId, status: "failed-verification", reason: "Rendered slide count does not match the parsed source" };
    }
    renderStructuredRevision(revision);
  } catch (error) {
    return { generationId, status: "failed-verification", reason: error instanceof Error ? error.message : "Unknown render failure" };
  }

  return { generationId, status: "migrated" };
}
