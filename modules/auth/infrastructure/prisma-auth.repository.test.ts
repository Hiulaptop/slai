import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { $transaction: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("../../database/infrastructure/client", () => ({ db: mocks.db }));

import { PrismaAuthRepository } from "./prisma-auth.repository";

describe("PrismaAuthRepository session rotation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses a conditional update so concurrent refreshes cannot both rotate", async () => {
    const current = {
      id: "session-1",
      userId: "user-1",
      refreshTokenHash: "old-hash",
      expiresAt: new Date("2030-01-01"),
      revokedAt: null,
    };
    const transaction = {
      authSession: {
        findUnique: vi.fn().mockResolvedValue(current),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };
    mocks.db.$transaction.mockImplementation(
      (operation: (client: typeof transaction) => unknown) => operation(transaction),
    );

    const result = await new PrismaAuthRepository().rotateSession({
      currentHash: "old-hash",
      nextHash: "new-hash",
      now: new Date("2026-08-02"),
    });

    expect(result).toBeNull();
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        id: "session-1",
        refreshTokenHash: "old-hash",
        revokedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      data: { refreshTokenHash: "new-hash" },
    });
  });
});
