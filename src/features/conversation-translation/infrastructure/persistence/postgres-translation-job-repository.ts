import {randomUUID} from "node:crypto";
import type {Pool} from "pg";
import type {TranslationJobRepository} from "@/features/conversation-translation/application/ports/translation-ports";
import {translationLocale, validateTranslationOutput, type TranslationFailure, type TranslationJob} from "@/features/conversation-translation/domain/types/translation";

export class PostgresTranslationJobRepository implements TranslationJobRepository {
  constructor(private readonly pool: Pool) {}

  async claim(now: Date): Promise<TranslationJob | null> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query(`with expired as (
        update conversation_translation_jobs set status='FAILED',failure_category='WORKER_RECOVERY_EXHAUSTED',
          lease_token=null,leased_until=null,updated_at=$1,version=version+1
        where status='RUNNING' and leased_until <= $1 and attempts >= 3 returning id)
        update conversation_message_translations set status='FAILED',updated_at=$1,version=version+1 where id in (select id from expired)`, [now]);
      const token = randomUUID();
      const result = await client.query<{id: string; message_id: string; target_locale: string; execution_id: string; source_locale: string}>(`with candidate as (
        select id from conversation_translation_jobs where (status='PENDING' or (status='RUNNING' and leased_until <= $1)) and attempts < 3
        order by created_at,id limit 1 for update skip locked), claimed as (
        update conversation_translation_jobs j set status='RUNNING',attempts=attempts+1,lease_token=$2,
          leased_until=$1::timestamptz + interval '60 seconds',updated_at=$1,version=version+1
        from candidate c where j.id=c.id returning j.*)
        select c.*,t.source_locale from claimed c join conversation_message_translations t on t.id=c.id`, [now, token]);
      const row = result.rows[0];
      if (row) await client.query("update conversation_message_translations set status='RUNNING',updated_at=$2,version=version+1 where id=$1", [row.id, now]);
      await client.query("commit");
      return row ? {id: row.id, messageId: row.message_id, targetLocale: translationLocale(row.target_locale), sourceLocale: translationLocale(row.source_locale), executionId: row.execution_id, leaseToken: token} : null;
    } catch { await client.query("rollback"); throw new Error("Translation claim failed."); }
    finally { client.release(); }
  }

  async withExecutionLock(job: TranslationJob, now: Date, work: (source: string, executionBudgetMs: number) => Promise<void>): Promise<boolean> {
    const started = performance.now();
    const client = await this.pool.connect();
    let locked = false;
    let released = false;
    try {
      const result = await client.query<{locked: boolean}>("select pg_try_advisory_lock(hashtextextended($1, 0)) as locked", [job.id]);
      locked = result.rows[0]?.locked === true;
      if (!locked) return false;
      const source = await client.query<{body: string; leased_until: Date}>(`select m.body,j.leased_until from conversation_translation_jobs j
        join conversation_messages m on m.id=j.message_id where j.id=$1 and j.status='RUNNING' and j.lease_token=$2 and j.leased_until>$3`, [job.id, job.leaseToken, now]);
      if (!source.rows[0]) return false;
      // Account for pool/query wait; reserve five seconds for durable finalization.
      const elapsedMs = Math.ceil(performance.now() - started);
      const executionBudgetMs = Math.min(45_000, source.rows[0].leased_until.getTime() - now.getTime() - elapsedMs - 5_000);
      if (executionBudgetMs < 1) return false;
      await work(source.rows[0].body, executionBudgetMs);
      return true;
    } finally {
      if (locked) {
        try { await client.query("select pg_advisory_unlock(hashtextextended($1, 0))", [job.id]); }
        catch { client.release(true); released = true; }
      }
      if (!released) client.release();
    }
  }

  async finish(job: TranslationJob, result: Readonly<{body: string}> | Readonly<{failure: TranslationFailure}>, now: Date): Promise<boolean> {
    const started = performance.now();
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query<{status: string; lease_token: string | null; leased_until: Date | null; body: string}>(`select j.status,j.lease_token,j.leased_until,m.body from conversation_translation_jobs j
        join conversation_messages m on m.id=j.message_id where j.id=$1 for update of j`, [job.id]);
      const row = current.rows[0];
      const checkedAt = new Date(now.getTime() + Math.ceil(performance.now() - started));
      if (!row || row.status !== "RUNNING" || row.lease_token !== job.leaseToken || !row.leased_until || row.leased_until <= checkedAt) {
        await client.query("commit"); return false;
      }
      const body = "body" in result ? validateTranslationOutput(result.body, row.body) : null;
      const failure = "failure" in result ? result.failure : null;
      const status = failure === "EMERGENCY_DISABLED" ? "CANCELLED" : failure ? "FAILED" : "SUCCEEDED";
      await client.query("update conversation_message_translations set status=$2,body=$3,updated_at=$4,version=version+1 where id=$1", [job.id, status, body, now]);
      await client.query("update conversation_translation_jobs set status=$2,failure_category=$3,lease_token=null,leased_until=null,updated_at=$4,version=version+1 where id=$1", [job.id, status, failure, now]);
      await client.query("commit"); return true;
    } catch { await client.query("rollback"); throw new Error("Translation finalization failed."); }
    finally { client.release(); }
  }
}
