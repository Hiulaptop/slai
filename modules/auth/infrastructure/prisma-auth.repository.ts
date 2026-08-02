import { db } from "../../database/infrastructure/client";
import type { AuthRepository } from "../application/auth.ports";
import type { AuthSession, AuthUser } from "../domain/auth.types";

function toAuthUser(user: {
  id: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): AuthUser {
  return user;
}

function toSession(session: AuthSession): AuthSession {
  return session;
}

export class PrismaAuthRepository implements AuthRepository {
  async findUserByEmail(email: string) {
    return db.user.findUnique({ where: { email } });
  }

  async findUserById(id: string) {
    const user = await db.user.findUnique({ where: { id } });
    return user ? toAuthUser(user) : null;
  }

  async createUserWithSession(input: {
    email: string;
    passwordHash: string;
    refreshTokenHash: string;
    expiresAt: Date;
    metadata: { ipAddress?: string; userAgent?: string };
  }) {
    return db.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: { email: input.email, passwordHash: input.passwordHash },
      });
      const session = await transaction.authSession.create({
        data: {
          userId: user.id,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.metadata.ipAddress,
          userAgent: input.metadata.userAgent,
        },
      });
      return { user: toAuthUser(user), session: toSession(session) };
    });
  }

  async createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    metadata: { ipAddress?: string; userAgent?: string };
  }) {
    return db.authSession.create({
      data: {
        userId: input.userId,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ipAddress: input.metadata.ipAddress,
        userAgent: input.metadata.userAgent,
      },
    });
  }

  async updateLastLogin(userId: string, at: Date) {
    const user = await db.user.update({
      where: { id: userId },
      data: { lastLoginAt: at },
    });
    return toAuthUser(user);
  }

  async rotateSession(input: {
    currentHash: string;
    nextHash: string;
    now: Date;
  }) {
    return db.$transaction(async (transaction) => {
      const current = await transaction.authSession.findUnique({
        where: { refreshTokenHash: input.currentHash },
      });

      if (!current || current.revokedAt || current.expiresAt <= input.now) {
        return null;
      }

      const rotated = await transaction.authSession.updateMany({
        where: {
          id: current.id,
          refreshTokenHash: input.currentHash,
          revokedAt: null,
          expiresAt: { gt: input.now },
        },
        data: { refreshTokenHash: input.nextHash },
      });

      if (rotated.count !== 1) {
        return null;
      }

      const [session, user] = await Promise.all([
        transaction.authSession.findUniqueOrThrow({ where: { id: current.id } }),
        transaction.user.findUnique({ where: { id: current.userId } }),
      ]);

      return user
        ? { session: toSession(session), user: toAuthUser(user) }
        : null;
    });
  }

  async revokeSession(refreshTokenHash: string, now: Date) {
    await db.authSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
