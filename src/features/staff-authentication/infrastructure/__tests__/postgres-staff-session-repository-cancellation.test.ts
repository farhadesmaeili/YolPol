import type {Pool, PoolClient, QueryResult} from "pg";
import {describe, expect, it, vi} from "vitest";

import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {PostgresStaffSessionRepository} from "@/features/staff-authentication/infrastructure/persistence/postgres/repositories/postgres-staff-session-repository";

function queryResult(rows: readonly Record<string, unknown>[] = []): QueryResult {
  return {command: "SELECT", rowCount: rows.length, oid: 0, fields: [], rows: [...rows]};
}

describe("PostgresStaffSessionRepository cancellation", () => {
  it("destroys the short-lived pool client when an active lookup is aborted and ignores the late query result", async () => {
    let resolveQuery: ((result: QueryResult) => void) | undefined;
    const query = vi.fn(() => new Promise<QueryResult>((resolve) => { resolveQuery = resolve; }));
    const release = vi.fn();
    const client = {query, release} as unknown as PoolClient;
    const pool = {connect: vi.fn().mockResolvedValue(client)} as unknown as Pool;
    const repository = new PostgresStaffSessionRepository(pool);
    const abort = new AbortController();

    const lookup = repository.findByLookup("a".repeat(64), {signal: abort.signal});
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    abort.abort();

    await expect(lookup).rejects.toBeInstanceOf(StaffAuthenticationPersistenceError);
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(true);
    resolveQuery?.(queryResult());
    await Promise.resolve();
    expect(release).toHaveBeenCalledOnce();
  });

  it("releases the pool client normally and removes cancellation behavior after lookup completion", async () => {
    const query = vi.fn().mockResolvedValue(queryResult());
    const release = vi.fn();
    const pool = {connect: vi.fn().mockResolvedValue({query, release})} as unknown as Pool;
    const repository = new PostgresStaffSessionRepository(pool);
    const abort = new AbortController();

    await expect(repository.findByLookup("a".repeat(64), {signal: abort.signal})).resolves.toBeNull();
    expect(release).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledWith(false);
    abort.abort();
    expect(release).toHaveBeenCalledOnce();
  });
});
