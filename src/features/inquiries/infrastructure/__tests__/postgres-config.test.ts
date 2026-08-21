import {describe, expect, it} from "vitest";

import {InvalidDatabaseConfigurationError, parsePostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";

describe("PostgreSQL configuration", () => {
  it("creates conservative pool settings without changing the URL", () => {
    const url = "postgresql://app:secret@postgres:5432/yolpol";
    expect(parsePostgresConfig(url)).toEqual({connectionString: url, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000});
  });

  it.each([undefined, "", "not-a-url", "https://user:secret@example.test/db", "postgresql://host/db", "postgresql://user@host/db", "postgresql://user:secret@host"])("rejects missing or malformed configuration safely", (value) => {
    expect(() => parsePostgresConfig(value)).toThrow(InvalidDatabaseConfigurationError);
    try { parsePostgresConfig(value); } catch (error) { expect(String(error)).not.toContain("secret"); }
  });
});
