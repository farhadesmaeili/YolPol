import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it, vi} from "vitest";
import {Pool} from "pg";
import {staffDiscoveryDatabaseConfig} from "@/features/customer-acquisition/infrastructure/config/staff-discovery-database-config";
import {parseStaffDiscoveryPage, PostgresStaffDiscoveryReader} from "@/features/customer-acquisition/infrastructure/readers/postgres-staff-discovery-reader";

const id = "00000000-0000-4000-8000-000000000001";
const candidate = {
  id, name: "Synthetic Bottler", country: "TR", domain: "bottler.example", segment: "glass-packaging",
  state: "PENDING_REVIEW", version: 0, expiresAt: "2026-10-15T00:00:00Z", expired: false,
  suppressed: false, policyAllowed: true,
  eligibility: {contract: "authorization-time-v1", evaluatedAt: "2026-10-12T00:00:00Z", status: "EVIDENCE_REQUIRED"},
  evidence: [{id, kind: "SOURCE", finding: "OBSERVED"}], matches: [],
};

describe("restricted Staff discovery reader", () => {
  it("accepts a bounded projection and rejects malformed or excessive data", () => {
    const parsed = parseStaffDiscoveryPage({candidates: [candidate], nextCursor: null});
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.candidates[0]).toEqual(candidate);
    expect(parsed.candidates[0]).not.toBe(candidate);
    for (const invalid of [
      {candidates: Array(21).fill(candidate), nextCursor: null},
      {candidates: [{...candidate, evidence: Array(33).fill(candidate.evidence[0])}], nextCursor: null},
      {candidates: [{...candidate, expired: true}], nextCursor: null},
      {candidates: [{...candidate, eligibility: {...candidate.eligibility, contract: "wrong"}}], nextCursor: null},
      {candidates: [{...candidate, name: ""}], nextCursor: null},
      {candidates: [candidate], nextCursor: id},
    ]) expect(() => parseStaffDiscoveryPage(invalid)).toThrow();
  });
  it("rejects unexpected fields, incorrect types, impossible dates and inconsistent eligibility", () => {
    const invalidCandidates: unknown[] = [
      {...candidate, internalPolicy: {fingerprint: "private"}},
      {...candidate, evidence: [{...candidate.evidence[0], url: "https://private.example", reference: "private"}]},
      {...candidate, matches: [{id, kind: "POSSIBLE_NAME_MATCH", resolved: false, otherCandidateId: id}]},
      {...candidate, eligibility: {...candidate.eligibility, policyFingerprint: "private"}},
      {...candidate, country: ["TR"]},
      {...candidate, state: ["PENDING_REVIEW"]},
      {...candidate, eligibility: {...candidate.eligibility, status: ["EVIDENCE_REQUIRED"]}},
      {...candidate, eligibility: {...candidate.eligibility, status: "CURRENTLY_APPROVED"}},
      {...candidate, eligibility: {...candidate.eligibility, status: "EXPIRED"}},
      {...candidate, eligibility: {...candidate.eligibility, status: "POLICY_DENIED"}},
      {...candidate, eligibility: {...candidate.eligibility, status: "SUPPRESSED"}},
      {...candidate, eligibility: {...candidate.eligibility, status: "TERMINAL"}},
      {...candidate, state: "SUPPRESSED", suppressed: false, eligibility: {...candidate.eligibility, status: "SUPPRESSED"}},
      {...candidate, state: "SUPPRESSED", eligibility: {...candidate.eligibility, status: "READY_FOR_APPROVAL"}},
      {...candidate, expiresAt: "2026-02-31T00:00:00Z"},
      {...candidate, eligibility: {...candidate.eligibility, evaluatedAt: "2027-02-29T00:00:00Z"}},
      {...candidate, eligibility: {...candidate.eligibility, evaluatedAt: "2100-02-29T00:00:00Z"}},
      {...candidate, expiresAt: "2026-10-01T00:00:00Z"},
      {...candidate, id: "not-a-uuid"},
      {...candidate, evidence: Array(33).fill(candidate.evidence[0])},
      {...candidate, matches: Array(21).fill({id, kind: "POSSIBLE_NAME_MATCH", resolved: false})},
      {...candidate, eligibility: null},
      {...candidate, matches: null},
      {...candidate, name: undefined},
    ];
    for (const invalid of invalidCandidates) {
      expect(() => parseStaffDiscoveryPage({candidates: [invalid], nextCursor: null})).toThrow();
    }
    expect(() => parseStaffDiscoveryPage({candidates: [candidate], nextCursor: null, private: true})).toThrow();
  });
  it("accepts valid current, historical, suppressed and microsecond observations", () => {
    const evidence = [candidate.evidence[0],
      ...["WEBSITE", "SEGMENT", "PACKAGING"].map(kind => ({id, kind, finding: "SUPPORTS"}))];
    const approved = {...candidate, state: "APPROVED", version: 1, evidence,
      eligibility: {...candidate.eligibility, status: "CURRENTLY_APPROVED"}};
    const expired = {...approved, expiresAt: "2026-10-11T00:00:00Z", expired: true,
      eligibility: {...approved.eligibility, status: "EXPIRED"}};
    const suppressed = {...candidate, state: "SUPPRESSED", suppressed: true,
      eligibility: {...candidate.eligibility, status: "SUPPRESSED"}};
    const microsecond = {...candidate, expiresAt: "2026-10-12T00:00:00.123456Z",
      eligibility: {...candidate.eligibility, evaluatedAt: "2026-10-12T00:00:00.123455+00:00"}};
    const leapDay = {...candidate, expiresAt: "2028-03-01T00:00:00Z",
      eligibility: {...candidate.eligibility, evaluatedAt: "2028-02-29T23:59:59.999999Z"}};
    for (const valid of [candidate, approved, expired, suppressed, microsecond, leapDay]) {
      expect(parseStaffDiscoveryPage({candidates: [valid], nextCursor: null}).candidates[0]).toEqual(valid);
    }
    const page = Array.from({length: 20}, (_, index) => ({...candidate, id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`}));
    const nextCursor = parseStaffDiscoveryPage({candidates: page, nextCursor: page[19].id}).nextCursor;
    expect(nextCursor).toBe(Buffer.from(`v1:${page[19].id}`).toString("base64url"));
  });
  it("accepts only a guarded disposable credential file and fixed database target", () => {
    const directory = mkdtempSync(join(tmpdir(), "staff-reader-test-"));
    try {
      const path = join(directory, "password");
      writeFileSync(path, "a".repeat(64), {mode: 0o600});
      const environment = {ACQUISITION_DISPOSABLE_TEST: "true", ACQUISITION_MODE: "synthetic-local", ACQUISITION_DISCOVERY_STAFF_READER_PASSWORD_FILE: path};
      expect(staffDiscoveryDatabaseConfig(environment)).toMatchObject({host: "acquisition-postgres", database: "yolpol_acquisition", user: "discovery_staff_reader"});
      expect(() => staffDiscoveryDatabaseConfig({...environment, ACQUISITION_DISPOSABLE_TEST: "false"})).toThrow();
      expect(() => staffDiscoveryDatabaseConfig({...environment, ACQUISITION_DATABASE_URL: "postgres://other"})).toThrow();
      expect(() => staffDiscoveryDatabaseConfig({...environment, YOLPOL_DEPLOYMENT_ENVIRONMENT: "production"})).toThrow();
    } finally { rmSync(directory, {recursive: true}); }
  });
  it("rejects an invalid cursor before opening a configured database connection", async () => {
    const directory = mkdtempSync(join(tmpdir(), "staff-reader-cursor-"));
    const connect = vi.spyOn(Pool.prototype, "connect");
    try {
      const path = join(directory, "password");
      writeFileSync(path, "a".repeat(64), {mode: 0o600});
      const reader = new PostgresStaffDiscoveryReader({ACQUISITION_DISPOSABLE_TEST: "true", ACQUISITION_MODE: "synthetic-local",
        ACQUISITION_DISCOVERY_STAFF_READER_PASSWORD_FILE: path});
      expect(await reader.listCandidates("' OR true --")).toEqual({status: "unavailable", reason: "service_failure"});
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
      rmSync(directory, {recursive: true});
    }
  });
});
