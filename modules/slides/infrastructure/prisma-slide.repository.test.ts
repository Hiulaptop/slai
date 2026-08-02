import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: { $transaction: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("../../database/infrastructure/client", () => ({ db: mocks.db }));
import { PrismaSlideRepository } from "./prisma-slide.repository";

const generation = { id: "generation-1", userId: "user-1", status: "COMPLETED" as const, approvedOutline: {}, htmlContent: "old", currentRevisionNumber: 2, nextRevisionNumber: 3, provider: "openai", modelId: "model", finishReason: null, promptTokens: null, completionTokens: null, totalTokens: null };

describe("PrismaSlideRepository", () => {
  beforeEach(() => vi.clearAllMocks());
  it("does not create an orphan revision when edit CAS fails", async () => {
    const tx = { slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, slideRevision: { create: vi.fn() } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().appendEdit({ generation, html: "new", edits: [{ slideNumber: 1, prompt: "edit" }] })).resolves.toBeNull();
    expect(tx.slideRevision.create).not.toHaveBeenCalled();
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user-1", currentRevisionNumber: 2, nextRevisionNumber: 3 }) }));
  });
  it("creates a branching edit revision from the current pointer", async () => {
    const tx = { slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ ...generation, currentRevisionNumber: 3, nextRevisionNumber: 4 }) }, slideRevision: { create: vi.fn().mockResolvedValue({}) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await new PrismaSlideRepository().appendEdit({ generation, html: "new", edits: [{ slideNumber: 1, prompt: "edit" }] });
    expect(tx.slideRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ revisionNumber: 3, parentRevisionNumber: 2, operation: "EDIT" }) });
  });
  it("restores the parent using a conditional update", async () => {
    const tx = { slideRevision: { findUnique: vi.fn().mockResolvedValue({ parentRevisionNumber: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue({ revisionNumber: 1, htmlContent: "parent" }) }, slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().undo(generation)).resolves.toBeNull();
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith({ where: { id: "generation-1", userId: "user-1", currentRevisionNumber: 2 }, data: { currentRevisionNumber: 1, htmlContent: "parent" } });
  });
});
