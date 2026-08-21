import type {PoolConfig} from "pg";

export class InvalidDatabaseConfigurationError extends Error {
  readonly name = "InvalidDatabaseConfigurationError";
}

export function parsePostgresConfig(value: string | undefined): PoolConfig {
  if (!value) throw new InvalidDatabaseConfigurationError("DATABASE_URL is required.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new InvalidDatabaseConfigurationError("DATABASE_URL must be a valid PostgreSQL URL."); }
  if (!(["postgres:", "postgresql:"] as const).includes(url.protocol as never) || !url.hostname || !url.username || !url.password || url.pathname.length < 2) {
    throw new InvalidDatabaseConfigurationError("DATABASE_URL must include a PostgreSQL host, database, user, and password.");
  }
  return Object.freeze({connectionString: value, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000});
}

export function readPostgresConfig(environment: NodeJS.ProcessEnv = process.env): PoolConfig {
  return parsePostgresConfig(environment.DATABASE_URL);
}
