import { describe, expect, it, vi } from "vitest";

import type { SlideRepository, StoredPresentation } from "./slide.ports";
import { PresentationAccessPolicy } from "./presentation-access.policy";

const presentation: StoredPresentation = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  userId: "user-1",
  status: "COMPLETED",
  approvedOutline: {},
  htmlContent: "<html></html>",
  currentRevisionNumber: 1,
  nextRevisionNumber: 2,
  provider: "openai",
  modelId: "model",
  finishReason: null,
  promptTokens: null,
  completionTokens: null,
  totalTokens: null,
  title: "Deck",
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: new Date(),
};

function repository(result: StoredPresentation | null): SlideRepository {
  return {
    findOwned: vi.fn().mockResolvedValue(result),
  } as unknown as SlideRepository;
}

describe("PresentationAccessPolicy", () => {
  it("allows owner reads in any lifecycle state", async () => {
    const pending = { ...presentation, status: "PENDING" as const, htmlContent: null };
    await expect(new PresentationAccessPolicy(repository(pending)).require(pending.id, "user-1", "read")).resolves.toEqual(pending);
  });

  it("allows completed mutation and rejects incomplete mutation", async () => {
    await expect(new PresentationAccessPolicy(repository(presentation)).require(presentation.id, "user-1", "mutate")).resolves.toEqual(presentation);
    const failed = { ...presentation, status: "FAILED" as const, htmlContent: null };
    await expect(new PresentationAccessPolicy(repository(failed)).require(failed.id, "user-1", "mutate")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects processing deletion", async () => {
    const processing = { ...presentation, status: "PROCESSING" as const };
    await expect(new PresentationAccessPolicy(repository(processing)).require(processing.id, "user-1", "delete")).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("conceals missing and cross-owner presentations", async () => {
    const repo = repository(null);
    await expect(new PresentationAccessPolicy(repo).require(presentation.id, "other-user", "read")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(repo.findOwned).toHaveBeenCalledWith(presentation.id, "other-user");
  });
});
