import type { BackfillResult } from "./backfill";
import type { ClassificationResult } from "./classify";

export type UnsupportedDisposition = "retain-legacy-html" | "manual-conversion";

export interface AuditReport {
  generatedAt: string;
  totals: {
    alreadyStructured: number;
    migrated: number;
    unsupported: number;
    failed: number;
  };
  unsupported: (ClassificationResult & { disposition: "unsupported"; approvedDisposition: UnsupportedDisposition })[];
  failed: BackfillResult[];
}

// design.md's migration plan and the spec's "Legacy migration preserves
// content explicitly" requirement both say every unsupported record needs
// an explicit, approved retention or manual-conversion decision - never a
// silent default. This function is the enforcement point: it throws,
// listing exactly which generation IDs are missing a decision, instead of
// building a report that quietly omits them.
export function buildAuditReport(
  classifications: ClassificationResult[],
  backfillResults: BackfillResult[],
  unsupportedDispositions: ReadonlyMap<string, UnsupportedDisposition>,
): AuditReport {
  const unsupportedClassifications = classifications.filter(
    (result): result is ClassificationResult & { disposition: "unsupported" } => result.disposition === "unsupported",
  );
  const missingDisposition = unsupportedClassifications.filter((result) => !unsupportedDispositions.has(result.generationId));
  if (missingDisposition.length) {
    throw new Error(
      `Missing an approved retention or manual-conversion disposition for ${missingDisposition.length} unsupported presentation(s): ${missingDisposition.map((result) => result.generationId).join(", ")}`,
    );
  }

  const failed = backfillResults.filter((result) => result.status === "failed-verification" || result.status === "failed-conflict");

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      alreadyStructured: classifications.filter((result) => result.disposition === "already-structured").length,
      migrated: backfillResults.filter((result) => result.status === "migrated").length,
      unsupported: unsupportedClassifications.length,
      failed: failed.length,
    },
    unsupported: unsupportedClassifications.map((result) => ({ ...result, approvedDisposition: unsupportedDispositions.get(result.generationId)! })),
    failed,
  };
}
