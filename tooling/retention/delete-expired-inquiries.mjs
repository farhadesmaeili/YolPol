import {Pool} from "pg";
import {pathToFileURL} from "node:url";

export const inquiryRetentionMonths = 24;

export function inquiryRetentionCutoff(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error("A valid retention clock is required.");
  const targetYear = now.getUTCFullYear() - 2;
  const lastDay = new Date(Date.UTC(targetYear, now.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, now.getUTCMonth(), Math.min(now.getUTCDate(), lastDay), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(), now.getUTCMilliseconds()));
}

export async function deleteExpiredInquiries(database, cutoff) {
  if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime())) throw new Error("A valid retention cutoff is required.");
  const result = await database.query("delete from inquiries where created_at < $1 returning id", [cutoff]);
  return result.rowCount ?? 0;
}

function databaseUrl(value) {
  if (!value) throw new Error("DATABASE_URL is required for Inquiry retention cleanup.");
  const parsed = new URL(value);
  if (!['postgres:','postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.username || !parsed.password || parsed.pathname.length < 2) throw new Error("DATABASE_URL must be a complete PostgreSQL URL.");
  return value;
}

async function main() {
  const pool = new Pool({connectionString:databaseUrl(process.env.DATABASE_URL),max:1,connectionTimeoutMillis:5_000,idleTimeoutMillis:5_000,statement_timeout:30_000});
  try {
    const cutoff = inquiryRetentionCutoff(new Date());
    const removed = await deleteExpiredInquiries(pool, cutoff);
    process.stdout.write(`Inquiry retention cleanup removed ${removed} record(s) older than ${cutoff.toISOString()}.\n`);
  } finally { await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write("Inquiry retention cleanup failed.\n"); process.exitCode = 1; });
}
