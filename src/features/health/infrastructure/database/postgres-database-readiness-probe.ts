import type {DatabaseReadinessProbe} from "@/features/health/application/ports/health-readiness-ports";

export const expectedDatabaseMigrationTimestamp = 1788832991886;
export const databaseReadinessQueryTimeoutMilliseconds = 3_000;

type MigrationRow = Readonly<{created_at: string | number | null}>;
type ReadinessQueryable = Readonly<{
  query<TResult>(config: Readonly<{
    text: string;
    query_timeout: number;
  }>): Promise<Readonly<{rows: readonly TResult[]}>>;
}>;

export class DatabaseSchemaNotReadyError extends Error {
  readonly name = "DatabaseSchemaNotReadyError";
}

export class PostgresDatabaseReadinessProbe implements DatabaseReadinessProbe {
  constructor(private readonly getDatabase: () => ReadinessQueryable) {}

  async check(): Promise<void> {
    const result = await this.getDatabase().query<MigrationRow>({
      text: "select created_at from drizzle.__drizzle_migrations order by id desc limit 1",
      query_timeout: databaseReadinessQueryTimeoutMilliseconds,
    });
    const latest = Number(result.rows[0]?.created_at);
    if (!Number.isSafeInteger(latest) || latest < expectedDatabaseMigrationTimestamp) {
      throw new DatabaseSchemaNotReadyError("The database schema is not ready for this application build.");
    }
  }
}
