// Integration tests against a real database, deliberately not mocked - see
// structured-repository.integration.test.ts's doc comment for why: the
// point of this suite is proving classify -> backfill -> re-classify
// actually dedupes/skips against real rows, which mocking would beg the
// question of.

import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "../../../database/infrastructure/client";
import { backfillLegacyGenerations } from "./backfill";
import { classifyLegacyGenerations } from "./classify";
import { buildAuditReport } from "./report";

let databaseAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    databaseAvailable = false;
  }
}, 30_000);

const createdGenerationIds: string[] = [];

afterEach(async () => {
  if (!databaseAvailable) return;
  while (createdGenerationIds.length) {
    const id = createdGenerationIds.pop()!;
    await db.slideGeneration.delete({ where: { id } }).catch(() => undefined);
  }
});

// Both are convertible now: the per-slide-HTML model only needs the
// `.slai-slide[data-slide-number]` wrapper the legacy whole-document HTML
// pipeline always used, regardless of whether the content inside came from
// the old marker-based design editor or freeform AI-authored markup.
const LEGACY_DESIGN_HTML =
  '<!doctype html><html><body><div class="slai-slide" data-slide-number="1">' +
  '<div data-slai-el="t1" data-slai-el-type="text" data-slai-font-size="24" data-slai-color="#171713" data-slai-align="left" style="position:absolute;left:10px;top:10px;width:200px;height:40px;z-index:0;">Legacy title</div>' +
  "</div></body></html>";

const FREEFORM_AI_HTML =
  '<!doctype html><html><body><div class="slai-slide" data-slide-number="1"><h1 style="color:red">Quarterly results</h1></div></body></html>';

// No `.slai-slide` markers at all - nothing to extract per slide.
const NO_MARKERS_HTML = "<!doctype html><html><body><p>plain document with no slide markers</p></body></html>";

async function createLegacyGeneration(html: string): Promise<string> {
  const generation = await db.slideGeneration.create({
    data: {
      userId: null,
      status: "COMPLETED",
      title: "Legacy migration test",
      provider: "openai",
      modelId: "test-model",
      requestPayload: {},
      htmlContent: html,
      currentRevisionNumber: 1,
      nextRevisionNumber: 2,
    },
    select: { id: true },
  });
  await db.slideRevision.create({
    data: {
      slideGenerationId: generation.id,
      revisionNumber: 1,
      operation: "GENERATE",
      htmlContent: html,
    },
  });
  createdGenerationIds.push(generation.id);
  return generation.id;
}

describe("legacy migration tooling (integration)", () => {
  it("classifies both marker-based and freeform legacy HTML as convertible, and markerless HTML as unsupported, without writing anything", async () => {
    if (!databaseAvailable) return;
    const markerId = await createLegacyGeneration(LEGACY_DESIGN_HTML);
    const freeformId = await createLegacyGeneration(FREEFORM_AI_HTML);
    const unsupportedId = await createLegacyGeneration(NO_MARKERS_HTML);

    const results = await classifyLegacyGenerations(db);

    expect(results.find((r) => r.generationId === markerId)).toMatchObject({ disposition: "convertible", slideCount: 1 });
    expect(results.find((r) => r.generationId === freeformId)).toMatchObject({ disposition: "convertible", slideCount: 1 });
    expect(results.find((r) => r.generationId === unsupportedId)).toMatchObject({ disposition: "unsupported" });

    // Dry-run: no snapshot rows were created by classification alone.
    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: { in: [markerId, freeformId, unsupportedId] } } });
    expect(snapshotRows).toHaveLength(0);
  });

  it("backfills a convertible generation into a verified structured revision, and re-classifies it as already-structured", async () => {
    if (!databaseAvailable) return;
    const generationId = await createLegacyGeneration(FREEFORM_AI_HTML);

    const firstRun = await backfillLegacyGenerations(db);
    expect(firstRun.find((r) => r.generationId === generationId)).toMatchObject({ status: "migrated" });

    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].html).toContain("Quarterly results");

    // Idempotent: re-running does not touch the now-structured generation.
    const secondRun = await backfillLegacyGenerations(db);
    expect(secondRun.find((r) => r.generationId === generationId)).toMatchObject({ status: "skipped-already-structured" });

    const reclassified = await classifyLegacyGenerations(db);
    expect(reclassified.find((r) => r.generationId === generationId)).toMatchObject({ disposition: "already-structured" });

    const snapshotRowsAfterRerun = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(snapshotRowsAfterRerun).toHaveLength(1); // no duplicate row from the second run
  });

  it("skips unsupported generations during backfill without writing structured rows", async () => {
    if (!databaseAvailable) return;
    const generationId = await createLegacyGeneration(NO_MARKERS_HTML);

    const results = await backfillLegacyGenerations(db);
    expect(results.find((r) => r.generationId === generationId)).toMatchObject({ status: "skipped-unsupported" });

    const snapshotRows = await db.slideSnapshot.findMany({ where: { slideGenerationId: generationId } });
    expect(snapshotRows).toHaveLength(0);
  });

  it("requires an explicit disposition for every unsupported record before building the audit report", async () => {
    if (!databaseAvailable) return;
    const unsupportedId = await createLegacyGeneration(NO_MARKERS_HTML);
    const classifications = await classifyLegacyGenerations(db);
    const backfillResults = await backfillLegacyGenerations(db);

    expect(() => buildAuditReport(classifications, backfillResults, new Map())).toThrow(/Missing an approved/);

    const report = buildAuditReport(classifications, backfillResults, new Map([[unsupportedId, "manual-conversion"]]));
    expect(report.unsupported).toContainEqual(expect.objectContaining({ generationId: unsupportedId, approvedDisposition: "manual-conversion" }));
    expect(report.totals.unsupported).toBeGreaterThanOrEqual(1);
  });
});
