import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adapter: vi.fn(function MockAdapter(config: unknown) {
    return { config };
  }),
  client: vi.fn(function MockClient(options: unknown) {
    return { options };
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: mocks.adapter,
}));
vi.mock("../../../generated/prisma/client", () => ({
  PrismaClient: mocks.client,
}));

describe("database client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
    delete (globalThis as { databaseClient?: unknown }).databaseClient;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { databaseClient?: unknown }).databaseClient;
  });

  it("creates a Prisma client from decoded MySQL connection settings", async () => {
    vi.stubEnv(
      "DATABASE_URL",
      "mysql://slide%40user:p%40ss@database.test:3307/slides%20app",
    );

    const { db } = await import("./client");

    expect(mocks.adapter).toHaveBeenCalledWith({
      host: "database.test",
      port: 3307,
      user: "slide@user",
      password: "p@ss",
      database: "slides app",
    });
    expect(mocks.client).toHaveBeenCalledWith({
      adapter: { config: expect.any(Object) },
    });
    expect(db).toBeInstanceOf(Object);
  });

  it("uses the default MySQL port when the URL omits it", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://slai:secret@localhost/slai");

    await import("./client");

    expect(mocks.adapter).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3306 }),
    );
  });

  it.each([
    [undefined, "DATABASE_URL is required"],
    ["not-a-url", "valid MySQL URL"],
    ["postgresql://slai:secret@localhost/slai", "mysql protocol"],
    ["mysql://localhost/slai", "host, username, password, and database"],
  ])("rejects invalid database configuration", async (databaseUrl, message) => {
    if (databaseUrl === undefined) {
      vi.stubEnv("DATABASE_URL", "");
    } else {
      vi.stubEnv("DATABASE_URL", databaseUrl);
    }

    await expect(import("./client")).rejects.toThrow(message);
    expect(mocks.adapter).not.toHaveBeenCalled();
    expect(mocks.client).not.toHaveBeenCalled();
  });

  it("reuses the development client across module reloads", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://slai:secret@localhost/slai");

    const first = await import("./client");
    vi.resetModules();
    const second = await import("./client");

    expect(second.db).toBe(first.db);
    expect(mocks.adapter).toHaveBeenCalledTimes(1);
    expect(mocks.client).toHaveBeenCalledTimes(1);
  });

  it("does not populate the development cache in production", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://slai:secret@localhost/slai");
    vi.stubEnv("NODE_ENV", "production");

    await import("./client");

    expect(
      (globalThis as { databaseClient?: unknown }).databaseClient,
    ).toBeUndefined();
  });
});
