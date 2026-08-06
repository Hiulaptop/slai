import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: { $transaction: vi.fn() } }));
vi.mock("server-only", () => ({}));
vi.mock("../../database/infrastructure/client", () => ({ db: mocks.db }));
import { PrismaSlideRepository } from "./prisma-slide.repository";

const firstHtml = '<html><head></head><body><div class="slai-slide" data-slide-number="1">One</div><div class="slai-slide" data-slide-number="2">Two</div></body></html>';
const secondHtml = firstHtml.replace(">One<", ">Changed<");
const generation = { id: "generation-1", userId: "user-1", status: "COMPLETED" as const, approvedOutline: { slides: [{ number: 1 }, { number: 2 }] }, htmlContent: secondHtml, currentRevisionNumber: 2, nextRevisionNumber: 3, provider: "openai", modelId: "model", finishReason: null, promptTokens: null, completionTokens: null, totalTokens: null, title: "Deck", createdAt: new Date("2026-08-02T00:00:00Z"), updatedAt: new Date("2026-08-02T00:01:00Z"), completedAt: new Date("2026-08-02T00:01:00Z") };

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
  it("restores one slide and avoids an orphan undo revision when CAS fails", async () => {
    const tx = { slideRevision: { findMany: vi.fn().mockResolvedValue([{ revisionNumber: 2, parentRevisionNumber: 1, operation: "EDIT", editRequest: null, htmlContent: secondHtml }, { revisionNumber: 1, parentRevisionNumber: null, operation: "GENERATE", editRequest: null, htmlContent: firstHtml }]), create: vi.fn() }, slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().undo(generation, 1)).resolves.toBeNull();
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentRevisionNumber: 2, nextRevisionNumber: 3 }), data: expect.objectContaining({ currentRevisionNumber: 3, htmlContent: expect.stringContaining(">One</div>") }) }));
    expect(tx.slideRevision.create).not.toHaveBeenCalled();
  });

  it("appends an immutable per-slide undo revision", async () => {
    const updated = { ...generation, htmlContent: firstHtml, currentRevisionNumber: 3, nextRevisionNumber: 4 };
    const tx = { slideRevision: { findMany: vi.fn().mockResolvedValue([{ revisionNumber: 2, parentRevisionNumber: 1, operation: "EDIT", editRequest: null, htmlContent: secondHtml }, { revisionNumber: 1, parentRevisionNumber: null, operation: "GENERATE", editRequest: null, htmlContent: firstHtml }]), create: vi.fn() }, slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue(updated) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().undo(generation, 1)).resolves.toEqual(updated);
    expect(tx.slideRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ operation: "UNDO", parentRevisionNumber: 2, revisionNumber: 3, changedSlideNumbers: [1], htmlContent: expect.stringContaining(">Two</div>") }) });
  });

  it("continues to an earlier slide version after unrelated edits follow undo", async () => {
    const thirdHtml = firstHtml.replace(">One<", ">Newest<");
    const undoHtml = secondHtml;
    const afterOtherEdit = undoHtml.replace(">Two<", ">Other changed<");
    const current = { ...generation, htmlContent: afterOtherEdit, currentRevisionNumber: 5, nextRevisionNumber: 6 };
    const revisions = [
      { revisionNumber: 5, parentRevisionNumber: 4, operation: "EDIT", editRequest: null, htmlContent: afterOtherEdit },
      { revisionNumber: 4, parentRevisionNumber: 3, operation: "UNDO", editRequest: { slideNumber: 1, restoredFromRevision: 2 }, htmlContent: undoHtml },
      { revisionNumber: 3, parentRevisionNumber: 2, operation: "EDIT", editRequest: null, htmlContent: thirdHtml },
      { revisionNumber: 2, parentRevisionNumber: 1, operation: "EDIT", editRequest: null, htmlContent: secondHtml },
      { revisionNumber: 1, parentRevisionNumber: null, operation: "GENERATE", editRequest: null, htmlContent: firstHtml },
    ];
    const updated = { ...current, currentRevisionNumber: 6, nextRevisionNumber: 7 };
    const tx = { slideRevision: { findMany: vi.fn().mockResolvedValue(revisions), create: vi.fn() }, slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue(updated) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await new PrismaSlideRepository().undo(current, 1);
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ htmlContent: expect.stringContaining(">One</div>") }) }));
  });

  it("lists owner summaries with a stable cursor boundary", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    (mocks.db as Record<string, unknown>).slideGeneration = { findMany };
    const cursor = {
      createdAt: "2026-08-02T00:00:00.000Z",
      id: "123e4567-e89b-12d3-a456-426614174000",
    };
    await new PrismaSlideRepository().listOwned({ userId: "user-1", limit: 20, cursor });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        OR: [
          { createdAt: { lt: new Date(cursor.createdAt) } },
          { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 21,
      select: {
        id: true,
        title: true,
        status: true,
        currentRevisionNumber: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
      },
    });
  });

  it("saves a design using the client's expected revision as the CAS condition", async () => {
    const updated = { ...generation, htmlContent: firstHtml, currentRevisionNumber: 3, nextRevisionNumber: 4 };
    const tx = { slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: vi.fn().mockResolvedValue(updated) }, slideRevision: { create: vi.fn().mockResolvedValue({}) } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().saveDesign({ generation, html: firstHtml, expectedRevision: 2 })).resolves.toEqual(updated);
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentRevisionNumber: 2, nextRevisionNumber: 3 }) }));
    expect(tx.slideRevision.create).toHaveBeenCalledWith({ data: expect.objectContaining({ revisionNumber: 3, parentRevisionNumber: 2, operation: "EDIT", changedSlideNumbers: [1, 2] }) });
  });
  it("rejects a design save when the client's expected revision is stale", async () => {
    const tx = { slideGeneration: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, slideRevision: { create: vi.fn() } };
    mocks.db.$transaction.mockImplementation((operation: (client: typeof tx) => unknown) => operation(tx));
    await expect(new PrismaSlideRepository().saveDesign({ generation, html: firstHtml, expectedRevision: 1 })).resolves.toBeNull();
    expect(tx.slideRevision.create).not.toHaveBeenCalled();
    expect(tx.slideGeneration.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ currentRevisionNumber: 1 }) }));
  });
  it("conditionally deletes only owned non-processing presentations", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    (mocks.db as Record<string, unknown>).slideGeneration = { deleteMany };
    await expect(new PrismaSlideRepository().deleteOwned({ id: "generation-1", userId: "user-1" })).resolves.toBe(false);
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: "generation-1", userId: "user-1", status: { not: "PROCESSING" } } });
  });
});
