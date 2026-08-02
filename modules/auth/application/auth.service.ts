import type {
  AccessTokenService,
  AuthRepository,
  PasswordService,
  RefreshTokenService,
} from "./auth.ports";
import { AuthError } from "../domain/auth.errors";
import type { Credentials } from "../domain/credentials.schema";
import type {
  AuthResult,
  AuthUser,
  SessionMetadata,
} from "../domain/auth.types";

const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly accessTokens: AccessTokenService,
    private readonly refreshTokens: RefreshTokenService,
  ) {}

  async register(
    credentials: Credentials,
    metadata: SessionMetadata,
  ): Promise<AuthResult> {
    if (await this.repository.findUserByEmail(credentials.email)) {
      throw new AuthError("REGISTRATION_FAILED", "Registration failed");
    }

    const refreshToken = this.refreshTokens.generate();

    let created;

    try {
      created = await this.repository.createUserWithSession({
        email: credentials.email,
        passwordHash: await this.passwords.hash(credentials.password),
        refreshTokenHash: this.refreshTokens.hash(refreshToken),
        expiresAt: sessionExpiry(),
        metadata,
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        throw new AuthError("REGISTRATION_FAILED", "Registration failed");
      }

      throw error;
    }

    return {
      user: created.user,
      refreshToken,
      accessToken: await this.accessTokens.sign(
        created.user.id,
        created.session.id,
      ),
    };
  }

  async login(
    credentials: Credentials,
    metadata: SessionMetadata,
  ): Promise<AuthResult> {
    const user = await this.repository.findUserByEmail(credentials.email);
    const passwordMatches = user
      ? await this.passwords.verify(credentials.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches || user.status !== "ACTIVE") {
      throw new AuthError("INVALID_CREDENTIALS", "Invalid credentials");
    }

    const refreshToken = this.refreshTokens.generate();
    const session = await this.repository.createSession({
      userId: user.id,
      refreshTokenHash: this.refreshTokens.hash(refreshToken),
      expiresAt: sessionExpiry(),
      metadata,
    });
    const authenticatedUser = await this.repository.updateLastLogin(
      user.id,
      new Date(),
    );

    return {
      user: authenticatedUser,
      refreshToken,
      accessToken: await this.accessTokens.sign(user.id, session.id),
    };
  }

  async refresh(refreshToken: string): Promise<Omit<AuthResult, "user">> {
    const nextToken = this.refreshTokens.generate();
    const rotated = await this.repository.rotateSession({
      currentHash: this.refreshTokens.hash(refreshToken),
      nextHash: this.refreshTokens.hash(nextToken),
      now: new Date(),
    });

    if (!rotated || rotated.user.status !== "ACTIVE") {
      throw new AuthError("UNAUTHORIZED", "Unauthorized");
    }

    return {
      refreshToken: nextToken,
      accessToken: await this.accessTokens.sign(
        rotated.user.id,
        rotated.session.id,
      ),
    };
  }

  async logout(refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.repository.revokeSession(
        this.refreshTokens.hash(refreshToken),
        new Date(),
      );
    }
  }

  async authenticate(authorization: string | null): Promise<AuthUser> {
    const token = parseBearerToken(authorization);

    try {
      const claims = await this.accessTokens.verify(token);
      const user = await this.repository.findUserById(claims.userId);

      if (!user || user.status !== "ACTIVE") {
        throw new Error("Inactive user");
      }

      return user;
    } catch {
      throw new AuthError("UNAUTHORIZED", "Unauthorized");
    }
  }
}

function parseBearerToken(authorization: string | null): string {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);

  if (!match) {
    throw new AuthError("UNAUTHORIZED", "Unauthorized");
  }

  return match[1];
}

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_LIFETIME_MS);
}

function isUniqueConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
