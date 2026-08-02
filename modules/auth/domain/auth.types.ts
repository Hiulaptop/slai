export type AuthUserStatus = "ACTIVE" | "DISABLED";

export interface AuthUser {
  id: string;
  email: string;
  status: AuthUserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserWithPassword extends AuthUser {
  passwordHash: string;
}

export interface AuthSession {
  id: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}
