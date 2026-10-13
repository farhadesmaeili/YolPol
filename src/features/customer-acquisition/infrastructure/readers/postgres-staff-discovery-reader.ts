import {Pool, type PoolClient} from "pg";
import type {StaffDiscoveryCandidate, StaffDiscoveryReadResult, StaffDiscoveryReader} from "@/features/customer-acquisition/application/ports/staff-discovery-reader";
import {staffDiscoveryDatabaseConfig} from "@/features/customer-acquisition/infrastructure/config/staff-discovery-database-config";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const states = ["PENDING_REVIEW", "NEEDS_EVIDENCE", "IDENTITY_CONFLICT", "APPROVED", "REJECTED", "SUPPRESSED", "DUPLICATE"] as const;
const statuses = ["EXPIRED", "POLICY_DENIED", "SUPPRESSED", "TERMINAL", "IDENTITY_CONFLICT", "EVIDENCE_REQUIRED", "READY_FOR_APPROVAL", "CURRENTLY_APPROVED"] as const;
const evidenceKinds = ["SOURCE", "WEBSITE", "SEGMENT", "PACKAGING"] as const;
const findingKinds = ["EXACT_DUPLICATE", "STRONG_CONFLICT", "POSSIBLE_NAME_MATCH"] as const;
const candidateKeys = ["id", "name", "country", "domain", "segment", "state", "version", "expiresAt", "expired", "suppressed", "policyAllowed", "eligibility", "evidence", "matches"];
const eligibilityKeys = ["contract", "evaluatedAt", "status"];
const evidenceKeys = ["id", "kind", "finding"];
const matchKeys = ["id", "kind", "resolved"];
const maxConnections = 2;
const maxAdmittedReads = 4;

let sharedPool: Pool | undefined;
let sharedPassword: string | undefined;
let admittedReads = 0;

const object = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const string = (value: unknown, max: number): value is string => typeof value === "string" && value.length > 0 && value.length <= max;
const oneOf = <T extends string>(value: unknown, values: readonly T[]): value is T =>
  typeof value === "string" && values.some(allowed => allowed === value);

// Compare complete UTC microseconds without rounding through JavaScript Date.
function timestampKey(value: unknown): string | null {
  if (!string(value, 40)) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|\+00:00)$/u.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]); const month = Number(parts[2]); const day = Number(parts[3]);
  const hour = Number(parts[4]); const minute = Number(parts[5]); const second = Number(parts[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > days[month - 1]) return null;
  return parts[1] + "-" + parts[2] + "-" + parts[3] + "T" + parts[4] + ":" + parts[5] + ":" + parts[6] + "." + (parts[7] ?? "").padEnd(6, "0");
}

function decodeCursor(cursor: string | null): string | null {
  if (cursor === null) return null;
  if (!/^[A-Za-z0-9_-]{52}$/u.test(cursor)) throw new Error("Invalid cursor.");
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!decoded.startsWith("v1:") || !uuid.test(decoded.slice(3)) || Buffer.from(decoded).toString("base64url") !== cursor) throw new Error("Invalid cursor.");
  return decoded.slice(3);
}

function encodeCursor(cursor: unknown): string | null {
  if (cursor === null) return null;
  if (typeof cursor !== "string" || !uuid.test(cursor)) throw new Error("Invalid database cursor.");
  return Buffer.from("v1:" + cursor).toString("base64url");
}

function parseCandidate(value: unknown): StaffDiscoveryCandidate {
  if (!object(value) || !exactKeys(value, candidateKeys) || typeof value.id !== "string" || !uuid.test(value.id)
    || !string(value.name, 160) || typeof value.country !== "string" || !/^[A-Z]{2}$/u.test(value.country)
    || !string(value.domain, 253) || !string(value.segment, 64)
    || !oneOf(value.state, states) || !Number.isSafeInteger(value.version) || (value.version as number) < 0 || (value.version as number) > 2147483646
    || timestampKey(value.expiresAt) === null || typeof value.expired !== "boolean" || typeof value.suppressed !== "boolean"
    || typeof value.policyAllowed !== "boolean" || !object(value.eligibility) || !exactKeys(value.eligibility, eligibilityKeys)
    || value.eligibility.contract !== "authorization-time-v1" || timestampKey(value.eligibility.evaluatedAt) === null
    || !oneOf(value.eligibility.status, statuses) || !Array.isArray(value.evidence) || value.evidence.length < 1 || value.evidence.length > 32
    || !Array.isArray(value.matches) || value.matches.length > 20) throw new Error("Invalid database candidate.");

  const evidence: StaffDiscoveryCandidate["evidence"][number][] = [];
  for (const item of value.evidence) {
    if (!object(item) || !exactKeys(item, evidenceKeys) || typeof item.id !== "string" || !uuid.test(item.id)
      || typeof item.finding !== "string"
      || !oneOf(item.kind, evidenceKinds)
      || (item.kind === "SOURCE" ? item.finding !== "OBSERVED" : item.finding !== "SUPPORTS" && item.finding !== "CONTRADICTS")) {
      throw new Error("Invalid database evidence.");
    }
    evidence.push({id: item.id, kind: item.kind, finding: item.finding});
  }

  const matches: StaffDiscoveryCandidate["matches"][number][] = [];
  for (const item of value.matches) {
    if (!object(item) || !exactKeys(item, matchKeys) || typeof item.id !== "string" || !uuid.test(item.id)
      || !oneOf(item.kind, findingKinds) || typeof item.resolved !== "boolean") throw new Error("Invalid database finding.");
    matches.push({id: item.id, kind: item.kind, resolved: item.resolved});
  }

  const expiresAt = timestampKey(value.expiresAt);
  const evaluatedAt = timestampKey(value.eligibility.evaluatedAt);
  if (expiresAt === null || evaluatedAt === null || value.expired !== (expiresAt <= evaluatedAt)
    || (value.state === "SUPPRESSED" && !value.suppressed)) throw new Error("Inconsistent database eligibility.");
  const requiredStatus = value.expired ? "EXPIRED" : !value.policyAllowed ? "POLICY_DENIED"
    : value.suppressed ? "SUPPRESSED" : value.state === "REJECTED" || value.state === "DUPLICATE" ? "TERMINAL" : null;
  if (requiredStatus !== null && value.eligibility.status !== requiredStatus) throw new Error("Inconsistent database eligibility.");
  if (requiredStatus === null) {
    const unresolved = matches.some(item => !item.resolved);
    const supported = !evidence.some(item => item.finding === "CONTRADICTS")
      && ["WEBSITE", "SEGMENT", "PACKAGING"].every(kind => evidence.some(item => item.kind === kind && item.finding === "SUPPORTS"));
    if (!["IDENTITY_CONFLICT", "EVIDENCE_REQUIRED", "READY_FOR_APPROVAL", "CURRENTLY_APPROVED"].includes(value.eligibility.status)
      || (unresolved && value.eligibility.status !== "IDENTITY_CONFLICT")
      || (value.eligibility.status === "EVIDENCE_REQUIRED" && supported && !unresolved)
      || (value.eligibility.status === "READY_FOR_APPROVAL" && (value.state === "APPROVED" || !supported))
      || (value.eligibility.status === "CURRENTLY_APPROVED" && (value.state !== "APPROVED" || !supported))) {
      throw new Error("Inconsistent database eligibility.");
    }
  }
  return {
    id: value.id, name: value.name, country: value.country, domain: value.domain, segment: value.segment,
    state: value.state, version: value.version as number, expiresAt: value.expiresAt as string,
    expired: value.expired, suppressed: value.suppressed, policyAllowed: value.policyAllowed,
    eligibility: {contract: "authorization-time-v1", evaluatedAt: value.eligibility.evaluatedAt as string, status: value.eligibility.status},
    evidence, matches,
  };
}

export function parseStaffDiscoveryPage(value: unknown): {candidates: StaffDiscoveryCandidate[]; nextCursor: string | null} {
  if (!object(value) || !exactKeys(value, ["candidates", "nextCursor"]) || !Array.isArray(value.candidates) || value.candidates.length > 20) {
    throw new Error("Invalid database page.");
  }
  const candidates = value.candidates.map(parseCandidate);
  const nextCursor = encodeCursor(value.nextCursor);
  if (nextCursor !== null && candidates.length !== 20) throw new Error("Invalid database pagination.");
  if (nextCursor !== null && value.nextCursor !== candidates[19].id) throw new Error("Invalid database pagination.");
  for (let index = 1; index < candidates.length; index++) {
    if (candidates[index - 1].id >= candidates[index].id) throw new Error("Invalid database ordering.");
  }
  return {candidates, nextCursor};
}

function readerPool(environment: Readonly<Record<string, string | undefined>>): Pool {
  const config = staffDiscoveryDatabaseConfig(environment);
  if (typeof config.password !== "string") throw new Error("Staff discovery reader credential rejected.");
  if (sharedPool) {
    if (config.password !== sharedPassword) throw new Error("Staff discovery reader credential changed.");
    return sharedPool;
  }
  sharedPool = new Pool({...config, max: maxConnections, idleTimeoutMillis: 1000, allowExitOnIdle: true});
  sharedPool.on("error", () => { console.error("Staff discovery reader idle connection unavailable."); });
  sharedPassword = config.password;
  return sharedPool;
}

export async function closeStaffDiscoveryReaderPool(): Promise<void> {
  const pool = sharedPool;
  if (!pool) return;
  await pool.end();
  sharedPool = undefined;
  sharedPassword = undefined;
}

export class PostgresStaffDiscoveryReader implements StaffDiscoveryReader {
  constructor(private readonly environment: Readonly<Record<string, string | undefined>>) {}

  async listCandidates(cursor: string | null): Promise<StaffDiscoveryReadResult> {
    let client: PoolClient | undefined;
    let admitted = false;
    let broken = false;
    try {
      const after = decodeCursor(cursor);
      const pool = readerPool(this.environment);
      if (admittedReads >= maxAdmittedReads) throw new Error("Staff discovery reader capacity exhausted.");
      admittedReads += 1;
      admitted = true;
      client = await pool.connect();
      const result = await client.query<{result: unknown}>("select public.acquisition_staff_discovery_queue($1::uuid) as result", [after]);
      if (result.rows.length !== 1) throw new Error("Invalid database page count.");
      return {status: "available", page: parseStaffDiscoveryPage(result.rows[0].result)};
    } catch {
      broken = true;
      return {status: "unavailable", reason: "service_failure"};
    } finally {
      client?.release(broken);
      if (admitted) admittedReads -= 1;
    }
  }
}
