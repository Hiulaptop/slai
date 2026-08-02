import "server-only";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../../../generated/prisma/client";

const globalForDatabase = globalThis as typeof globalThis & {
  databaseClient?: PrismaClient;
};

function createDatabaseClient(): PrismaClient {
  const adapter = new PrismaMariaDb(parseDatabaseUrl(process.env.DATABASE_URL));
  return new PrismaClient({ adapter });
}

function parseDatabaseUrl(databaseUrl: string | undefined) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  let url: URL;

  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid MySQL URL");
  }

  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL must use the mysql protocol");
  }

  const database = decodeURIComponent(url.pathname.slice(1));

  if (!url.hostname || !url.username || !url.password || !database) {
    throw new Error(
      "DATABASE_URL must include a host, username, password, and database name",
    );
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

export const db = globalForDatabase.databaseClient ?? createDatabaseClient();

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.databaseClient = db;
}
