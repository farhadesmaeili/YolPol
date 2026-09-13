import {and, eq, isNull} from "drizzle-orm";
import {drizzle, type NodePgDatabase} from "drizzle-orm/node-postgres";
import type {Pool, PoolClient, QueryResult, QueryResultRow} from "pg";

import type {StaffSessionRepository} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import {StaffSession} from "@/features/staff-authentication/domain/entities/staff-session";
import {parseStaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAuthenticationPersistenceError} from "@/features/staff-authentication/infrastructure/errors/staff-authentication-persistence-error";
import {staffAuthenticationPostgresSchema, staffSessions} from "@/features/staff-authentication/infrastructure/persistence/postgres/schema/staff-authentication-schema";

type StaffAuthenticationDatabase = NodePgDatabase<typeof staffAuthenticationPostgresSchema>;
type StaffSessionRow = QueryResultRow & {
  sessionId: string;
  sessionStaffAccountId: string;
  tokenLookup: string;
  tokenVerification: string;
  sessionCreatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  staffAccountId: string;
  teamMemberId: string;
  role: string;
  staffAccountActive: boolean;
  teamMemberActive: boolean;
  teamMemberDisplayName: string;
};

function cancellationError(): Error {
  const error = new Error("Staff session lookup cancelled.");
  error.name = "AbortError";
  return error;
}

async function acquireClient(pool: Pool, signal?: AbortSignal): Promise<PoolClient> {
  if (!signal) return pool.connect();
  if (signal.aborted) throw cancellationError();

  return new Promise<PoolClient>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(cancellationError());
    };
    signal.addEventListener("abort", onAbort, {once: true});
    void pool.connect().then((client) => {
      signal.removeEventListener("abort", onAbort);
      if (settled || signal.aborted) {
        client.release();
        if (!settled) reject(cancellationError());
        settled = true;
        return;
      }
      settled = true;
      resolve(client);
    }, (error: unknown) => {
      signal.removeEventListener("abort", onAbort);
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

async function queryWithCancellation<Row extends QueryResultRow>(
  pool: Pool,
  text: string,
  values: readonly unknown[],
  signal?: AbortSignal,
): Promise<QueryResult<Row>> {
  const client = await acquireClient(pool, signal);
  return new Promise<QueryResult<Row>>((resolve, reject) => {
    let released = false;
    let settled = false;
    const release = (destroy = false) => {
      if (released) return;
      released = true;
      client.release(destroy);
    };
    const removeAbortListener = () => signal?.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      release(true);
      reject(cancellationError());
    };
    signal?.addEventListener("abort", onAbort, {once: true});
    if (signal?.aborted) {
      onAbort();
      return;
    }

    let query: Promise<QueryResult<Row>>;
    try { query = client.query<Row>(text, [...values]); }
    catch (error) {
      settled = true;
      removeAbortListener();
      release(true);
      reject(error);
      return;
    }
    void query.then((result) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      release();
      resolve(result);
    }, (error: unknown) => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      release();
      reject(error);
    });
  });
}

export class PostgresStaffSessionRepository implements StaffSessionRepository {
  private readonly database: StaffAuthenticationDatabase;

  constructor(private readonly pool: Pool) { this.database = drizzle(pool, {schema: staffAuthenticationPostgresSchema}); }

  async create(session: StaffSession): Promise<void> {
    try {
      await this.database.insert(staffSessions).values({
        id: session.id,
        staffAccountId: session.staffAccountId,
        tokenLookup: session.tokenLookup,
        tokenVerification: session.tokenVerification,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
      });
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }

  async findByLookup(lookup: string, options?: Readonly<{signal?: AbortSignal}>) {
    try {
      const result = await queryWithCancellation<StaffSessionRow>(this.pool, `
        select
          ss.id as "sessionId", ss.staff_account_id as "sessionStaffAccountId",
          ss.token_lookup as "tokenLookup", ss.token_verification as "tokenVerification",
          ss.created_at as "sessionCreatedAt", ss.expires_at as "expiresAt", ss.revoked_at as "revokedAt",
          sa.id as "staffAccountId", sa.team_member_id as "teamMemberId", sa.role,
          sa.active as "staffAccountActive", tm.active as "teamMemberActive", tm.display_name as "teamMemberDisplayName"
        from staff_sessions ss
        join staff_accounts sa on sa.id = ss.staff_account_id
        join inquiry_team_members tm on tm.id = sa.team_member_id
        where ss.token_lookup = $1
        limit 1
      `, [lookup], options?.signal);
      const row = result.rows[0];
      if (!row) return null;
      return Object.freeze({
        session: StaffSession.reconstitute({
          id: row.sessionId,
          staffAccountId: row.sessionStaffAccountId,
          tokenLookup: row.tokenLookup,
          tokenVerification: row.tokenVerification,
          createdAt: row.sessionCreatedAt,
          expiresAt: row.expiresAt,
          ...(row.revokedAt ? {revokedAt: row.revokedAt} : {}),
        }),
        staffAccountId: row.staffAccountId,
        teamMemberId: row.teamMemberId,
        role: parseStaffRole(row.role),
        staffAccountActive: row.staffAccountActive,
        teamMemberActive: row.teamMemberActive,
        teamMemberDisplayName: row.teamMemberDisplayName,
      });
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }

  async revokeById(sessionId: string, revokedAt: Date): Promise<void> {
    try {
      await this.database.update(staffSessions).set({revokedAt}).where(and(eq(staffSessions.id, sessionId), isNull(staffSessions.revokedAt)));
    } catch {
      throw new StaffAuthenticationPersistenceError();
    }
  }
}
