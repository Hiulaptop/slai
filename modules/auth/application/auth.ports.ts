import type {
  AuthSession,
  AuthUser,
  SessionMetadata,
  UserWithPassword,
} from "../domain/auth.types";

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserWithPassword | null>;
  findUserById(id: string): Promise<AuthUser | null>;
  createUserWithSession(input: {
    email: string;
    passwordHash: string;
    refreshTokenHash: string;
    expiresAt: Date;
    metadata: SessionMetadata;
  }): Promise<{ user: AuthUser; session: AuthSession }>;
  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    metadata: SessionMetadata;
  }): Promise<AuthSession>;
  updateLastLogin(userId: string, at: Date): Promise<AuthUser>;
  rotateSession(input: {
    currentHash: string;
    nextHash: string;
    now: Date;
  }): Promise<{ session: AuthSession; user: AuthUser } | null>;
  revokeSession(refreshTokenHash: string, now: Date): Promise<void>;
}

export interface PasswordService {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface AccessTokenService {
  sign(userId: string, sessionId: string): Promise<string>;
  verify(token: string): Promise<{ userId: string; sessionId: string }>;
}

export interface RefreshTokenService {
  generate(): string;
  hash(token: string): string;
}
