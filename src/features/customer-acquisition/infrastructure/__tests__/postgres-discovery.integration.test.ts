import {createHash, randomUUID} from "node:crypto";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {Pool, type PoolClient} from "pg";
import {discoveryDatabaseConfig} from "@/features/customer-acquisition/infrastructure/config/discovery-database-config";
import {canonicalDiscoveryPolicy} from "@/features/customer-acquisition/domain/services/discovery-source-policy";
import {discoveryEligibility} from "@/features/customer-acquisition/domain/services/discovery-eligibility";
import {acquisitionDatabaseConfig, readAcquisitionSecret} from "@/features/customer-acquisition/infrastructure/config/acquisition-config";
import {PostgresDiscoveryRepository} from "@/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-discovery-repository";
import {CompanyDiscovery} from "@/features/customer-acquisition/application/use-cases/company-discovery";
import {fixtureBatch, fixtureCandidate, fixturePolicy} from "@/features/customer-acquisition/testing/fixtures/discovery-fixtures";
import type {DiscoveryPolicy, DiscoveryPrincipal, EvidenceInput, ReviewInput} from "@/features/customer-acquisition/domain/types/discovery-types";

describe.runIf(process.env.ACQUISITION_DISPOSABLE_TEST === "true")("disposable discovery PostgreSQL", () => {
  let admin: Pool; let runtime: Pool; let intakePool: Pool; let reviewerPool: Pool; let app: CompanyDiscovery; let policy: DiscoveryPolicy;
  let credentialDirectory: string | undefined;
  const intake: DiscoveryPrincipal = {id: randomUUID(), capability: "INTAKE"};
  const reviewer: DiscoveryPrincipal = {id: randomUUID(), capability: "REVIEW"};
  const tableNames = ["acquisition_discovery_suppression_marks", "acquisition_discovery_reviews", "acquisition_discovery_operations", "acquisition_discovery_identity_matches", "acquisition_discovery_evidence", "acquisition_discovery_candidates", "acquisition_discovery_batches"];
  beforeAll(async () => {
    admin = new Pool({...acquisitionDatabaseConfig(process.env, "migration"), user: "acquisition_admin", password: readAcquisitionSecret(process.env.ACQUISITION_ADMIN_PASSWORD_FILE)});
    const marker = await admin.query("select current_database() as name, pg_read_file('/disposable-task0082') as marker");
    if (marker.rows[0].name !== "yolpol_acquisition" || marker.rows[0].marker.trim() !== "task0082-tmpfs") throw new Error("Disposable acquisition safety marker absent.");
    runtime = new Pool(acquisitionDatabaseConfig(process.env, "runtime"));
    // Docker Desktop bind mounts do not preserve POSIX mode bits. In the guarded
    // disposable test process only, copy these random secrets into private files.
    credentialDirectory = mkdtempSync(join(tmpdir(), "discovery-credentials-"));
    const environment = {...process.env};
    for (const key of ["ACQUISITION_DISCOVERY_INTAKE_PASSWORD_FILE", "ACQUISITION_DISCOVERY_REVIEWER_PASSWORD_FILE"]) {
      const path = join(credentialDirectory, key);
      writeFileSync(path, readAcquisitionSecret(process.env[key]), {flag: "wx", mode: 0o600});
      environment[key] = path;
    }
    intakePool = new Pool(discoveryDatabaseConfig(environment, "INTAKE"));
    reviewerPool = new Pool(discoveryDatabaseConfig(environment, "REVIEW"));
    app = new CompanyDiscovery(new PostgresDiscoveryRepository({intake: intakePool, reviewer: reviewerPool}, {find: (key, version) => key === policy.key && version === policy.version ? policy : undefined}));
  });
  beforeEach(async () => {
    await admin.query(`truncate ${tableNames.join(", ")}, acquisition_discovery_principal_bindings, acquisition_discovery_policies`);
    await admin.query("delete from acquisition_suppression_entries where source_reference = 'discovery-test'");
    const now = new Date();
    policy = {...fixturePolicy, reviewedAt: new Date(now.getTime() - 86400000).toISOString(), effectiveAt: new Date(now.getTime() - 86400000).toISOString(), expiresAt: new Date(now.getTime() + 7 * 86400000).toISOString()};
    await admin.query("insert into acquisition_discovery_principal_bindings(database_role,principal_id,capability) values('discovery_intake',$1,'INTAKE'),('discovery_reviewer',$2,'REVIEW')", [intake.id, reviewer.id]);
    await provisionPolicy();
  });
  afterAll(async () => {
    await Promise.all([runtime?.end(), intakePool?.end(), reviewerPool?.end(), admin?.end()]);
    if (credentialDirectory) rmSync(credentialDirectory, {recursive: true});
  });
  const fingerprint = () => createHash("sha256").update(JSON.stringify(canonicalDiscoveryPolicy(policy))).digest("hex");
  async function provisionPolicy() {
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("set local role discovery_provisioner");
      await client.query("insert into acquisition_discovery_policies(key,version,fingerprint,snapshot) values($1,$2,$3,$4)", [policy.key, policy.version, fingerprint(), canonicalDiscoveryPolicy(policy)]);
      await client.query("commit");
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  async function alterPolicy(mode: "revoked" | "changed") {
    if (mode === "revoked") await admin.query("update acquisition_discovery_policies set revoked=true");
    else {
      // Simulate trusted-authority corruption; runtime cannot update even this column.
      await admin.query("alter table acquisition_discovery_policies disable trigger discovery_policy_authority");
      try { await admin.query("update acquisition_discovery_policies set fingerprint=$1", ["0".repeat(64)]); }
      finally { await admin.query("alter table acquisition_discovery_policies enable trigger discovery_policy_authority"); }
    }
  }
  async function ownerQuery(statement: string, parameters: unknown[]) {
    const client = await admin.connect();
    try {
      await client.query("begin"); await client.query("set local role discovery_mutation_owner");
      const result = await client.query(statement, parameters); await client.query("commit"); return result;
    } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  }
  type Finding = Readonly<{candidateId: string; otherId: string; kind: "STRONG_CONFLICT" | "POSSIBLE_NAME_MATCH"}>;
  const findingSql = "insert into public.acquisition_discovery_identity_matches(id,candidate_id,other_candidate_id,kind,created_at) values($1,$2,$3,$4,clock_timestamp())";
  const findingParameters = (finding: Finding) => [randomUUID(), finding.candidateId, finding.otherId, finding.kind];
  const guardDefinition = async () => (await admin.query<{definition: string}>("select pg_get_functiondef('public.acquisition_discovery_match_guard()'::regprocedure) as definition")).rows[0].definition;
  async function findingSnapshot(id: string) {
    return {history: await history(id), matches: (await admin.query("select * from acquisition_discovery_identity_matches where candidate_id=$1 order by id", [id])).rows,
      reviews: (await admin.query("select * from acquisition_discovery_reviews where candidate_id=$1 order by id", [id])).rows,
      evidence: (await admin.query("select * from acquisition_discovery_evidence where candidate_id=$1 order by id", [id])).rows};
  }
  async function findingControl(run: (client: PoolClient) => Promise<void>, omittedPredicate?: "terminal" | "count") {
    const original = await guardDefinition();
    const client = await admin.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(820082)");
      if (omittedPredicate) {
        // Transaction-local copy in this marker-guarded disposable database only.
        // Replace exactly one predicate; rollback restores the installed function.
        const predicate = omittedPredicate === "terminal"
          ? "c.state IN ('APPROVED','REJECTED','SUPPRESSED','DUPLICATE')"
          : "(SELECT count(*) FROM public.acquisition_discovery_identity_matches WHERE candidate_id=c.id) >= 20";
        expect(original.split(predicate)).toHaveLength(2);
        await client.query(original.replace(predicate, "false"));
      }
      await client.query("set local role discovery_mutation_owner");
      await run(client);
    } finally {
      try { await client.query("rollback"); } finally { client.release(); }
      expect(await guardDefinition()).toBe(original);
    }
  }
  async function expectFindingRejected(client: PoolClient, finding: Finding) {
    await expect(client.query(findingSql, findingParameters(finding))).rejects.toMatchObject({code: "P0001", message: "Discovery finding rejected"});
  }
  async function proveFindingGuard(finding: Finding, predicate: "terminal" | "count") {
    const before = await findingSnapshot(finding.candidateId);
    await findingControl(client => expectFindingRejected(client, finding));
    expect(await findingSnapshot(finding.candidateId)).toEqual(before);
    // The identical rejection assertion must fail when only its target predicate is absent.
    // A PostgreSQL error (including unrelated validation) cannot satisfy this assertion.
    await expect(findingControl(client => expectFindingRejected(client, finding), predicate))
      .rejects.toMatchObject({name: "AssertionError", message: expect.stringContaining("promise resolved")});
    expect(await findingSnapshot(finding.candidateId)).toEqual(before);
  }
  async function create(key = "batch-1", patch = {}) {
    const result = await app.submit(intake, {...fixtureBatch(key), candidates: [{...fixtureCandidate(), ...patch}]});
    const status = await app.batch(intake, result.batchId!);
    return {result, candidate: status.candidates[0]};
  }
  const review = (decision: ReviewInput["decision"], expectedVersion = 0, findingId: string | null = null): ReviewInput => ({idempotencyKey: randomUUID(), decision, expectedVersion, findingId,
    reason: decision === "SUPPRESS" ? "MANUAL_SUPPRESSION" : decision === "APPROVE" ? "EVIDENCE_REVIEWED" : "IDENTITY_REVIEWED"});
  const fact = (kind: EvidenceInput["kind"], expectedVersion = 0): EvidenceInput => ({idempotencyKey: randomUUID(), expectedVersion, kind, finding: "SUPPORTS", url: "https://bottler-1.example/evidence", observedAt: fixtureCandidate().observedAt, reference: "fixture-evidence"});
  async function support(id: string) { for (const kind of ["WEBSITE", "SEGMENT", "PACKAGING"] as const) await app.evidence(reviewer, id, fact(kind)); }
  async function shortDeadline(id: string) {
    // Guarded disposable administrator only: shorten, never renew, a synthetic fixture.
    await admin.query("alter table acquisition_discovery_candidates disable trigger acquisition_discovery_candidate_guard");
    try { await admin.query("update acquisition_discovery_candidates set expires_at=clock_timestamp()+interval '2 seconds' where id=$1", [id]); }
    finally { await admin.query("alter table acquisition_discovery_candidates enable trigger acquisition_discovery_candidate_guard"); }
  }
  async function history(id: string) {
    return (await admin.query(`select state,version,expires_at,
      (select count(*)::int from acquisition_discovery_reviews where candidate_id=c.id) as reviews,
      (select count(*)::int from acquisition_discovery_evidence where candidate_id=c.id) as evidence,
      (select count(*)::int from acquisition_discovery_operations) as operations
      from acquisition_discovery_candidates c where id=$1`, [id])).rows[0];
  }
  async function assertEligibilityParity(batchId: string, identityConflict = false, evidenceSatisfied = true) {
    const c = (await app.batch(intake, batchId)).candidates[0];
    expect(c.eligibility).toEqual(discoveryEligibility({...c, evaluatedAt: c.eligibility.evaluatedAt, identityConflict, evidenceSatisfied}));
  }
  it("SEC-0083-04 A distinguishes normal historical approval from current eligibility", async () => {
    const {candidate, result} = await create();
    expect(candidate.eligibility).toMatchObject({contract: "authorization-time-v1", status: "EVIDENCE_REQUIRED"});
    await assertEligibilityParity(result.batchId!, false, false);
    await support(candidate.id);
    expect((await app.batch(intake, result.batchId!)).candidates[0].eligibility.status).toBe("READY_FOR_APPROVAL");
    await assertEligibilityParity(result.batchId!);
    await app.review(reviewer, candidate.id, review("APPROVE"));
    expect((await app.batch(intake, result.batchId!)).candidates[0]).toMatchObject({state: "APPROVED", eligibility: {status: "CURRENTLY_APPROVED"}});
    expect((await app.queue(reviewer, null)).candidates[0].eligibility.status).toBe("CURRENTLY_APPROVED");
    await assertEligibilityParity(result.batchId!);
    expect((await history(candidate.id)).reviews).toBe(1);
    await expect(app.review(reviewer, candidate.id, review("APPROVE", 1))).rejects.toThrow("CONFLICT");
  });
  it.each(["revocation", "fingerprint", "suppression"] as const)("SEC-0083-04 E/F preserves approved history after %s without stale eligibility", async mode => {
    const {candidate, result} = await create(); await support(candidate.id);
    const decision = review("APPROVE"); await app.review(reviewer, candidate.id, decision);
    const before = await history(candidate.id);
    if (mode === "fingerprint") await alterPolicy("changed");
    else if (mode === "revocation") {
      const client = await admin.connect();
      try { await client.query("begin"); await client.query("set local role discovery_provisioner"); await client.query("update acquisition_discovery_policies set revoked=true"); await client.query("commit"); }
      finally { await client.query("rollback"); client.release(); }
    } else {
      const id = randomUUID();
      await runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference) values($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test')", [id, fixtureCandidate().domain]);
      expect((await app.batch(intake, result.batchId!)).candidates[0].eligibility.status).toBe("SUPPRESSED");
      await runtime.query("update acquisition_suppression_entries set released_at=clock_timestamp() where id=$1", [id]);
    }
    const denied = mode === "suppression" ? "SUPPRESSED" : "POLICY_DENIED";
    expect((await app.batch(intake, result.batchId!)).candidates[0]).toMatchObject({state: "APPROVED", eligibility: {status: denied}});
    expect((await app.queue(reviewer, null)).candidates[0].eligibility.status).toBe(denied);
    await assertEligibilityParity(result.batchId!);
    await expect(app.review(reviewer, candidate.id, decision)).rejects.toThrow(denied);
    await expect(app.review(reviewer, candidate.id, review("APPROVE", 1))).rejects.toThrow(denied);
    await expect(app.evidence(reviewer, candidate.id, fact("WEBSITE", 1))).rejects.toThrow(denied);
    await expect(app.submit(intake, fixtureBatch())).rejects.toThrow(denied);
    await expect(app.submit({...intake, id: randomUUID()}, fixtureBatch("other-principal"))).rejects.toThrow("FORBIDDEN");
    expect(await history(candidate.id)).toEqual(before);
    if (mode === "suppression") {
      expect((await create("new-key", {domain: "renamed.example"})).candidate.eligibility.status).toBe("SUPPRESSED");
      const other: DiscoveryPrincipal = {id: randomUUID(), capability: "INTAKE"};
      await admin.query("delete from acquisition_discovery_principal_bindings where database_role='discovery_intake'");
      await admin.query("insert into acquisition_discovery_principal_bindings(database_role,principal_id,capability) values('discovery_intake',$1,'INTAKE')", [other.id]);
      const next = await app.submit(other, fixtureBatch("new-principal"));
      expect((await app.batch(other, next.batchId!)).candidates[0].eligibility.status).toBe("SUPPRESSED");
    } else await expect(app.submit(intake, fixtureBatch("new-key"))).rejects.toThrow("POLICY_DENIED");
  });
  it("SEC-0083-02 denies direct SQL capability escalation and leaves no partial writes", async () => {
    const {candidate} = await create();
    const protectedTables = [...tableNames, "acquisition_discovery_principal_bindings", "acquisition_discovery_policies"];
    for (const [pool, role] of [[runtime, "acquisition_runtime"], [intakePool, "discovery_intake"], [reviewerPool, "discovery_reviewer"]] as const) {
      expect((await pool.query("select session_user as role")).rows[0].role).toBe(role);
      for (const table of protectedTables) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "TRIGGER", "REFERENCES"]) {
          expect((await pool.query("select has_table_privilege(current_user,$1,$2) as allowed", [table, privilege])).rows[0].allowed).toBe(false);
        }
      }
      for (const stronger of ["discovery_mutation_owner", "discovery_provisioner", "acquisition_migrator", "acquisition_admin", ...(role === "discovery_intake" ? ["discovery_reviewer"] : role === "discovery_reviewer" ? ["discovery_intake"] : ["discovery_intake", "discovery_reviewer"])]) {
        await expect(pool.query(`set role ${stronger}`)).rejects.toMatchObject({code: "42501"});
      }
      await expect(pool.query("update acquisition_discovery_candidates set state='APPROVED',version=1 where id=$1", [candidate.id])).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("update acquisition_discovery_policies set revoked=false")).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("update acquisition_discovery_principal_bindings set principal_id=$1", [randomUUID()])).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("insert into acquisition_discovery_evidence(id) values($1)", [randomUUID()])).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("insert into acquisition_discovery_reviews(id) values($1)", [randomUUID()])).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("create table public.forbidden_discovery(id int)")).rejects.toMatchObject({code: "42501"});
      await expect(pool.query("create temp table acquisition_discovery_policies(id int)")).rejects.toMatchObject({code: "42501"});
    }
    await expect(intakePool.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [reviewer.id, candidate.id, JSON.stringify(review("APPROVE"))])).rejects.toMatchObject({code: "42501"});
    await expect(intakePool.query("select public.acquisition_discovery_evidence($1,$2,$3::jsonb)", [reviewer.id, candidate.id, JSON.stringify(fact("WEBSITE"))])).rejects.toMatchObject({code: "42501"});
    await expect(reviewerPool.query("select public.acquisition_discovery_submit($1,$2::jsonb,$3)", [intake.id, JSON.stringify(fixtureBatch()), fingerprint()])).rejects.toMatchObject({code: "42501"});
    for (const table of ["acquisition_companies", "acquisition_company_domains", "acquisition_contacts", "acquisition_leads", "acquisition_suppression_entries"]) {
      await expect(reviewerPool.query(`delete from ${table} where false`)).rejects.toMatchObject({code: "42501"});
    }
    expect((await admin.query("select state,version from acquisition_discovery_candidates where id=$1", [candidate.id])).rows[0]).toEqual({state: "PENDING_REVIEW", version: 0});
    expect((await admin.query("select count(*)::int as n from acquisition_discovery_reviews")).rows[0].n).toBe(0);
  });
  it("SEC-0083-02 binds audit identity to session_user, not UUID or session settings", async () => {
    const {candidate} = await create();
    const forged = randomUUID(); const client = await reviewerPool.connect();
    try {
      await client.query("select set_config('discovery.reviewer_id',$1,false)", [forged]);
      await expect(client.query("select public.acquisition_discovery_evidence($1,$2,$3::jsonb)", [forged, candidate.id, JSON.stringify(fact("WEBSITE"))])).rejects.toThrow("FORBIDDEN");
      await expect(client.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [forged, candidate.id, JSON.stringify(review("REJECT"))])).rejects.toThrow("FORBIDDEN");
    } finally { client.release(); }
    await support(candidate.id); await app.review(reviewer, candidate.id, review("APPROVE"));
    expect((await admin.query("select distinct principal_id from acquisition_discovery_evidence where kind <> 'SOURCE'")).rows).toEqual([{principal_id: reviewer.id}]);
    expect((await admin.query("select reviewer_id from acquisition_discovery_reviews")).rows).toEqual([{reviewer_id: reviewer.id}]);
  });
  it.each(["missing", "revoked"])("SEC-0083-02 denies a %s protected reviewer binding", async mode => {
    const {candidate} = await create();
    await admin.query(mode === "missing" ? "delete from acquisition_discovery_principal_bindings where database_role='discovery_reviewer'" : "update acquisition_discovery_principal_bindings set revoked=true where database_role='discovery_reviewer'");
    await expect(app.evidence(reviewer, candidate.id, fact("WEBSITE"))).rejects.toThrow("FORBIDDEN");
    await expect(app.review(reviewer, candidate.id, review("REJECT"))).rejects.toThrow("FORBIDDEN");
    await expect(app.queue(reviewer, null)).rejects.toThrow("FORBIDDEN");
    expect((await admin.query("select count(*)::int as n from acquisition_discovery_reviews")).rows[0].n).toBe(0);
  });
  it("SEC-0083-02 refuses stale transaction snapshots after policy revocation", async () => {
    const {candidate} = await create(); const client = await reviewerPool.connect();
    try {
      await client.query("begin isolation level repeatable read");
      await client.query("select txid_current_snapshot()");
      await alterPolicy("revoked");
      await expect(client.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [reviewer.id, candidate.id, JSON.stringify(review("REJECT"))])).rejects.toThrow();
    } finally { await client.query("rollback"); client.release(); }
    expect((await admin.query("select count(*)::int as n from acquisition_discovery_reviews")).rows[0].n).toBe(0);
  });
  it("SEC-0083-02 protects versioned authority and definer ownership", async () => {
    const client = await admin.connect();
    try {
      await client.query("begin"); await client.query("set local role discovery_provisioner");
      await expect(client.query("update acquisition_discovery_policies set snapshot='{}'")).rejects.toMatchObject({code: "42501"});
      await client.query("rollback");
      await client.query("begin"); await client.query("set local role discovery_provisioner");
      await client.query("update acquisition_discovery_policies set revoked=true"); await client.query("commit");
      await client.query("begin"); await client.query("set local role discovery_provisioner");
      await expect(client.query("update acquisition_discovery_policies set revoked=false")).rejects.toThrow();
      await client.query("rollback");
    } finally { client.release(); }
    const functions = await admin.query("select p.proname,r.rolname,p.proconfig from pg_proc p join pg_roles r on r.oid=p.proowner join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'acquisition_discovery_%' and p.prosecdef");
    expect(functions.rows).toHaveLength(7);
    for (const fn of functions.rows) { expect(fn.rolname).toBe("discovery_mutation_owner"); expect(fn.proconfig).toContain("search_path=pg_catalog, pg_temp"); }
    const roles = await admin.query("select rolname,rolcanlogin,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolreplication,rolbypassrls from pg_roles where rolname like 'discovery_%'");
    expect(roles.rows).toHaveLength(4);
    for (const role of roles.rows) expect(role).toMatchObject({rolcanlogin: ["discovery_intake", "discovery_reviewer"].includes(role.rolname), rolsuper: false, rolinherit: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, rolbypassrls: false});
    expect((await admin.query("select has_schema_privilege('discovery_mutation_owner','public','CREATE') as allowed")).rows[0].allowed).toBe(false);
  });
  it("SEC-0083-01 does not apply a suppression released before the first candidate", async () => {
    const id = randomUUID();
    await runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference) values($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test')", [id, fixtureCandidate().domain]);
    await runtime.query("update acquisition_suppression_entries set released_at=clock_timestamp() where id=$1", [id]);
    const {candidate} = await create(); expect(candidate.suppressed).toBe(false); expect(candidate.state).toBe("PENDING_REVIEW");
    await support(candidate.id); await app.review(reviewer, candidate.id, review("APPROVE"));
  });
  it("SEC-0083-01 trusts server release history over future-dated legacy metadata", async () => {
    const id = randomUUID();
    await runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference,created_at) values($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test',clock_timestamp()+interval '1 day')", [id, fixtureCandidate().domain]);
    await runtime.query("update acquisition_suppression_entries set released_at=created_at where id=$1", [id]);
    const {candidate} = await create(); expect(candidate.suppressed).toBe(false);
    await support(candidate.id); await app.review(reviewer, candidate.id, review("APPROVE"));
  });
  it("SEC-0083-03 stamps intake at database time and rejects caller deadlines", async () => {
    const before = Date.now(); const {candidate} = await create();
    const stored = (await admin.query("select created_at,expires_at from acquisition_discovery_candidates where id=$1", [candidate.id])).rows[0];
    expect(stored.created_at.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(stored.expires_at.getTime() - stored.created_at.getTime()).toBeLessThanOrEqual(7 * 86400000);
    await expect(intakePool.query("select public.acquisition_discovery_submit($1,$2::jsonb,$3)", [intake.id, JSON.stringify({...fixtureBatch("future"), createdAt: "2100-01-01T00:00:00Z"}), fingerprint()])).rejects.toThrow("INVALID_REQUEST");
    expect((await admin.query("select count(*)::int as n from acquisition_discovery_batches")).rows[0].n).toBe(1);
  });
  it("SEC-0083-01 retains suppression introduced after intake and subsequently released", async () => {
    const first = await create();
    const suppressionId = randomUUID();
    await runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference) values ($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test')", [suppressionId, fixtureCandidate().domain]);
    await runtime.query("update acquisition_suppression_entries set released_at=clock_timestamp() where id=$1", [suppressionId]);
    expect.soft((await app.batch(intake, first.result.batchId!)).candidates[0].suppressed).toBe(true);
    await expect.soft(app.submit(intake, fixtureBatch())).rejects.toThrow("SUPPRESSED");
    await expect.soft(app.evidence(reviewer, first.candidate.id, fact("WEBSITE"))).rejects.toThrow("SUPPRESSED");
    await expect.soft(app.review(reviewer, first.candidate.id, review("APPROVE"))).rejects.toThrow("SUPPRESSED");
    expect.soft((await create("new-key", {recordId: "new-record"})).candidate.suppressed).toBe(true);
  });
  it("SEC-0083-01 cannot erase an observed active suppression with backdated Task 0082 timestamps", async () => {
    const {result, candidate} = await create(); const id = randomUUID();
    await runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference,created_at) values($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test',clock_timestamp()-interval '1 day')", [id, fixtureCandidate().domain]);
    expect((await app.batch(intake, result.batchId!)).candidates[0].suppressed).toBe(true);
    await runtime.query("update acquisition_suppression_entries set released_at=created_at where id=$1", [id]);
    expect.soft((await app.batch(intake, result.batchId!)).candidates[0].suppressed).toBe(true);
    await expect.soft(app.evidence(reviewer, candidate.id, fact("WEBSITE"))).rejects.toThrow("SUPPRESSED");
    expect.soft((await create("source-only", {domain: "renamed.example"})).candidate.suppressed).toBe(true);
  });
  it("SEC-0083-01 records suppression even when Task 0082 holds an older candidate snapshot", async () => {
    const client = await runtime.connect(); const id = randomUUID();
    try {
      await client.query("begin isolation level repeatable read"); await client.query("select txid_current_snapshot()");
      const first = await create();
      await client.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference,created_at) values($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test',clock_timestamp()-interval '1 day')", [id, fixtureCandidate().domain]);
      await client.query("update acquisition_suppression_entries set released_at=created_at where id=$1", [id]);
      await client.query("commit");
      expect((await app.batch(intake, first.result.batchId!)).candidates[0].suppressed).toBe(true);
    } finally { await client.query("rollback"); client.release(); }
  });
  it.each(["revoked", "changed"] as const)("SEC-0083-02 prevents runtime forgery under %s policy", async mode => {
    const {candidate} = await create();
    await alterPolicy(mode);
    policy = mode === "revoked" ? {...policy, revoked: true} : {...policy, evidenceReference: "changed-policy"};
    await expect(app.review(reviewer, candidate.id, review("APPROVE"))).rejects.toThrow("POLICY_DENIED");
    const attacker = randomUUID();
    const client = await runtime.connect();
    let committed = false;
    try {
      await client.query("begin");
      expect((await client.query("select session_user as role")).rows[0].role).toBe("acquisition_runtime");
      for (const kind of ["WEBSITE", "SEGMENT", "PACKAGING"]) {
        await client.query("insert into acquisition_discovery_evidence(id,candidate_id,principal_id,kind,finding,url,reference,observed_at,created_at) values($1,$2,$3,$4,'SUPPORTS','https://source.example/evidence','forged',clock_timestamp(),clock_timestamp())", [randomUUID(), candidate.id, attacker, kind]);
      }
      await client.query("insert into acquisition_discovery_reviews(id,candidate_id,reviewer_id,decision,reason,version,state,created_at) values($1,$2,$3,'APPROVE','EVIDENCE_REVIEWED',1,'APPROVED',clock_timestamp())", [randomUUID(), candidate.id, attacker]);
      await client.query("update acquisition_discovery_candidates set state='APPROVED',version=1 where id=$1", [candidate.id]);
      await client.query("commit"); committed = true;
    } catch (error) {
      await client.query("rollback");
      expect(error).toMatchObject({code: "42501"});
    } finally { client.release(); }
    expect.soft(committed).toBe(false);
    expect.soft((await admin.query("select state,version from acquisition_discovery_candidates where id=$1", [candidate.id])).rows[0]).toEqual({state: "PENDING_REVIEW", version: 0});
    expect.soft((await admin.query("select count(*)::int as n from acquisition_discovery_reviews")).rows[0].n).toBe(0);
    expect.soft((await admin.query("select count(*)::int as n from acquisition_discovery_evidence where kind <> 'SOURCE'")).rows[0].n).toBe(0);
  });
  it("SEC-0083-03 rejects a complete future-dated runtime batch", async () => {
    const first = await create(); const batchId = randomUUID(); const id = randomUUID();
    const client = await runtime.connect(); let committed = false;
    try {
      await client.query("begin");
      await client.query(`insert into acquisition_discovery_batches
        select $1,principal_id,synthetic,policy_key,policy_version,policy_fingerprint,
        jsonb_set(policy_snapshot::jsonb,'{expiresAt}','"2100-01-08T00:00:00.000Z"')::text,
        source_identity,method,run_reference,1,'2100-01-01'::timestamptz from acquisition_discovery_batches where id=$2`, [batchId, first.result.batchId]);
      await client.query(`insert into acquisition_discovery_candidates
        select $1,$2,1,'Future synthetic','future synthetic',country,'future.example',source_identity,'future-record',segment,fingerprint,'PENDING_REVIEW',0,'2100-01-01'::timestamptz,'2100-01-08'::timestamptz
        from acquisition_discovery_candidates where id=$3`, [id, batchId, first.candidate.id]);
      await client.query(`insert into acquisition_discovery_evidence select $1,$2,principal_id,kind,finding,url,reference,observed_at,created_at from acquisition_discovery_evidence where candidate_id=$3 and kind='SOURCE'`, [randomUUID(), id, first.candidate.id]);
      await client.query("commit"); committed = true;
    } catch (error) { await client.query("rollback"); expect(error).toMatchObject({code: "42501"}); }
    finally { client.release(); }
    expect.soft(committed).toBe(false);
    expect((await admin.query("select count(*)::int as n from acquisition_discovery_batches where id=$1", [batchId])).rows[0].n).toBe(0);
  });
  it("SEC-0083-04 B/D retains the early-constraint late-commit reproduction but denies every subsequent use", async () => {
    // Former strict commit-before-expiry assertion failed here. The user explicitly
    // replaced that invariant with authorization-time validity; retain the bypass sequence.
    const first = await create(); await support(first.candidate.id);
    const previousEvidence = fact("WEBSITE"); await app.evidence(reviewer, first.candidate.id, previousEvidence);
    await shortDeadline(first.candidate.id);
    const decision = review("APPROVE");
    const client = await reviewerPool.connect(); let committed = false;
    try {
      await client.query("begin");
      await client.query("set local transaction_timeout='8s'");
      await client.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [reviewer.id, first.candidate.id, JSON.stringify(decision)]);
      await client.query("set constraints all immediate");
      await client.query("select pg_sleep(2.1)");
      await client.query("commit"); committed = true;
    } catch (error) { await client.query("rollback"); throw error; }
    finally { client.release(); }
    expect(committed).toBe(true);
    const before = await history(first.candidate.id);
    expect(before).toMatchObject({state: "APPROVED", version: 1, reviews: 1});
    expect((await admin.query("select r.created_at<c.expires_at as authorized_before_expiry from acquisition_discovery_reviews r join acquisition_discovery_candidates c on c.id=r.candidate_id where c.id=$1", [first.candidate.id])).rows[0].authorized_before_expiry).toBe(true);
    expect((await app.batch(intake, first.result.batchId!)).candidates[0]).toMatchObject({state: "APPROVED", expired: true, eligibility: {status: "EXPIRED"}});
    expect((await app.queue(reviewer, null)).candidates[0].eligibility.status).toBe("EXPIRED");
    await assertEligibilityParity(first.result.batchId!);
    await expect(app.review(reviewer, first.candidate.id, decision)).rejects.toThrow("EXPIRED");
    await expect(app.review(reviewer, first.candidate.id, review("APPROVE", 1))).rejects.toThrow("EXPIRED");
    await expect(app.evidence(reviewer, first.candidate.id, fact("WEBSITE", 1))).rejects.toThrow("EXPIRED");
    await expect(app.evidence(reviewer, first.candidate.id, previousEvidence)).rejects.toThrow("EXPIRED");
    await expect(app.submit(intake, fixtureBatch())).rejects.toThrow("EXPIRED");
    await expect(app.submit(intake, fixtureBatch("fresh-key"))).rejects.toThrow("EXPIRED");
    await expect(app.submit({...intake, id: randomUUID()}, fixtureBatch("other-principal"))).rejects.toThrow("FORBIDDEN");
    expect(await history(first.candidate.id)).toEqual(before);
    const other: DiscoveryPrincipal = {id: randomUUID(), capability: "INTAKE"};
    await admin.query("delete from acquisition_discovery_principal_bindings where database_role='discovery_intake'");
    await admin.query("insert into acquisition_discovery_principal_bindings(database_role,principal_id,capability) values('discovery_intake',$1,'INTAKE')", [other.id]);
    await expect(app.submit(other, {...fixtureBatch("new-principal"), candidates: [{...fixtureCandidate(), domain: "renamed.example"}]})).rejects.toThrow("EXPIRED");
    expect(await history(first.candidate.id)).toEqual(before);
  });
  it("SEC-0083-04 C rejects authorization after expiry despite an earlier transaction start", async () => {
    const {candidate} = await create(); await support(candidate.id); await shortDeadline(candidate.id);
    const before = await history(candidate.id); const client = await reviewerPool.connect();
    try {
      await client.query("begin"); await client.query("select pg_sleep(2.1)");
      await expect(client.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [reviewer.id, candidate.id, JSON.stringify(review("APPROVE"))])).rejects.toThrow("EXPIRED");
    } finally { await client.query("rollback"); client.release(); }
    expect(await history(candidate.id)).toEqual(before);
  });
  it("SEC-0083-04 G rechecks wall time after a competing reviewer releases the lock", async () => {
    const {candidate, result} = await create(); await support(candidate.id); await shortDeadline(candidate.id);
    const client = await reviewerPool.connect();
    try {
      await client.query("begin");
      await client.query("select public.acquisition_discovery_review($1,$2,$3::jsonb)", [reviewer.id, candidate.id, JSON.stringify(review("APPROVE"))]);
      const competing = app.review(reviewer, candidate.id, review("REJECT")).then(() => "accepted", (error: Error) => error.message);
      await client.query("set constraints all immediate"); await client.query("select pg_sleep(2.1)"); await client.query("commit");
      expect(await competing).toBe("EXPIRED");
    } finally { await client.query("rollback"); client.release(); }
    expect(await history(candidate.id)).toMatchObject({state: "APPROVED", version: 1, reviews: 1});
    expect((await app.batch(intake, result.batchId!)).candidates[0].eligibility.status).toBe("EXPIRED");
  });
  it.each(["APPROVE", "SUPPRESS", "REJECT", "DUPLICATE"] as const)("SEC-0083-05 rejects valid matches after %s and detects a missing lifecycle guard", async decision => {
    const first = await create(); const other = await create("other", {...fixtureCandidate(2), domain: fixtureCandidate().domain});
    const finding: Finding = {candidateId: first.candidate.id, otherId: other.candidate.id, kind: "STRONG_CONFLICT"};
    const beforeControl = await findingSnapshot(first.candidate.id);
    await findingControl(async client => { expect((await client.query(findingSql, findingParameters(finding))).rowCount).toBe(1); });
    expect(await findingSnapshot(first.candidate.id)).toEqual(beforeControl);
    let duplicateFinding: string | null = null;
    if (decision === "DUPLICATE") {
      const peer = await create("duplicate-peer", {...fixtureCandidate(3), domain: fixtureCandidate().domain});
      duplicateFinding = randomUUID();
      await ownerQuery(findingSql, [duplicateFinding, first.candidate.id, peer.candidate.id, "STRONG_CONFLICT"]);
    }
    if (decision === "APPROVE") await support(first.candidate.id);
    await app.review(reviewer, first.candidate.id, review(decision, 0, duplicateFinding));
    await assertEligibilityParity(first.result.batchId!, decision === "DUPLICATE", decision === "APPROVE");
    await proveFindingGuard(finding, "terminal");
  });
  it("SEC-0083-05 accepts findings 1 through 20, rejects valid finding 21 and detects a missing count guard", async () => {
    const first = await create(); const findings: Finding[] = [];
    // Peers match the original candidate through separate identity groups, keeping
    // each peer's intake below its independent prior-match limit without disabling it.
    for (let index = 2; index <= 21; index++) {
      const weak = index <= 11;
      const peer = await create(`peer-${index}`, {...fixtureCandidate(index), ...(weak ? {name: fixtureCandidate().name} : {domain: fixtureCandidate().domain})});
      findings.push({candidateId: first.candidate.id, otherId: peer.candidate.id, kind: weak ? "POSSIBLE_NAME_MATCH" : "STRONG_CONFLICT"});
    }
    const extra = await create("peer-22", {...fixtureCandidate(22), recordId: fixtureCandidate().recordId});
    const twentyFirst: Finding = {candidateId: first.candidate.id, otherId: extra.candidate.id, kind: "STRONG_CONFLICT"};
    const beforeControl = await findingSnapshot(first.candidate.id);
    expect(beforeControl.matches).toHaveLength(0);
    await findingControl(async client => { expect((await client.query(findingSql, findingParameters(twentyFirst))).rowCount).toBe(1); });
    expect(await findingSnapshot(first.candidate.id)).toEqual(beforeControl);
    for (const finding of findings.slice(0, 19)) expect((await ownerQuery(findingSql, findingParameters(finding))).rowCount).toBe(1);
    expect((await findingSnapshot(first.candidate.id)).matches).toHaveLength(19);
    expect((await ownerQuery(findingSql, findingParameters(findings[19]))).rowCount).toBe(1);
    expect((await findingSnapshot(first.candidate.id)).matches).toHaveLength(20);
    expect(await history(first.candidate.id)).toEqual(beforeControl.history);
    await proveFindingGuard(twentyFirst, "count");
    expect((await findingSnapshot(first.candidate.id)).matches).toHaveLength(20);
  });
  it("SEC-0083-05 denies otherwise-valid finding INSERTs through all actual runtime credentials", async () => {
    const first = await create(); const other = await create("other", {...fixtureCandidate(2), domain: fixtureCandidate().domain});
    const finding: Finding = {candidateId: first.candidate.id, otherId: other.candidate.id, kind: "STRONG_CONFLICT"};
    const before = await findingSnapshot(first.candidate.id);
    await findingControl(async client => { expect((await client.query(findingSql, findingParameters(finding))).rowCount).toBe(1); });
    for (const [pool, role] of [[runtime, "acquisition_runtime"], [intakePool, "discovery_intake"], [reviewerPool, "discovery_reviewer"]] as const) {
      expect((await pool.query("select session_user as role")).rows[0].role).toBe(role);
      await expect(pool.query(findingSql, findingParameters(finding))).rejects.toMatchObject({code: "42501"});
      expect(await findingSnapshot(first.candidate.id)).toEqual(before);
    }
  });
  it("restricts discovery tables and preserves immutable history", async () => {
    const {candidate} = await create();
    const owner = await runtime.query("select current_user as role, pg_has_role(current_user, 'acquisition_migrator', 'MEMBER') as migrator");
    expect(owner.rows[0]).toEqual({role: "acquisition_runtime", migrator: false});
    for (const table of tableNames) {
      for (const privilege of ["DELETE", "TRUNCATE", "UPDATE"]) {
        expect((await runtime.query("select has_table_privilege(current_user, $1, $2) as allowed", [table, privilege])).rows[0].allowed).toBe(false);
      }
    }
    await expect(runtime.query("update acquisition_discovery_candidates set name='changed' where id=$1", [candidate.id])).rejects.toThrow();
    await expect(runtime.query("update acquisition_discovery_candidates set expires_at=expires_at+interval '1 day' where id=$1", [candidate.id])).rejects.toThrow();
    await expect(runtime.query("update acquisition_discovery_candidates set state='APPROVED', version=1 where id=$1", [candidate.id])).rejects.toThrow();
    await expect(runtime.query("create table public.discovery_forbidden(id int)")).rejects.toThrow();
    await expect(runtime.query("select * from drizzle.__drizzle_migrations")).rejects.toThrow();
  });
  it("inserts 20 atomically with one immutable source observation per candidate", async () => {
    const result = await app.submit(intake, {...fixtureBatch(), candidates: Array.from({length: 20}, (_, i) => fixtureCandidate(i))});
    expect((await app.batch(intake, result.batchId!)).candidates).toHaveLength(20);
    expect((await admin.query("select count(*)::int as count from acquisition_discovery_evidence")).rows[0].count).toBe(20);
    expect((await app.queue(reviewer, null)).candidates.every(c => c.evidence.length === 1)).toBe(true);
  });
  it("rolls back the entire batch after a later invalid observation", async () => {
    await expect(app.submit(intake, {...fixtureBatch(), candidates: [fixtureCandidate(), {...fixtureCandidate(2), observedAt: new Date(Date.now() + 86400000).toISOString()}]})).rejects.toThrow();
    for (const table of tableNames) expect((await admin.query(`select count(*)::int as count from ${table}`)).rows[0].count).toBe(0);
  });
  it("replays concurrent identical keys and rejects changed semantics", async () => {
    const [a, b] = await Promise.all([app.submit(intake, fixtureBatch()), app.submit(intake, fixtureBatch())]);
    expect(a).toEqual(b);
    await expect(app.submit(intake, {...fixtureBatch(), candidates: [fixtureCandidate(2)]})).rejects.toThrow("CONFLICT");
    expect((await admin.query("select count(*)::int as count from acquisition_discovery_candidates")).rows[0].count).toBe(1);
  });
  it("serializes different-key duplicates without accepting a second identity", async () => {
    const results = await Promise.all([app.submit(intake, fixtureBatch("a")), app.submit(intake, fixtureBatch("b"))]);
    const statuses = await Promise.all(results.map(r => app.batch(intake, r.batchId!)));
    expect(statuses.map(s => s.candidates[0].state).sort()).toEqual(["IDENTITY_CONFLICT", "PENDING_REVIEW"]);
    const findings = await admin.query("select kind from acquisition_discovery_identity_matches"); expect(findings.rows).toEqual([{kind: "EXACT_DUPLICATE"}]);
  });
  it("detects conflicting source identity without overwriting facts", async () => {
    await create(); const second = await create("second", {domain: "changed.example", name: "Synthetic Changed"});
    const queue = await app.queue(reviewer, null); const candidate = queue.candidates.find(c => c.id === second.candidate.id)!;
    expect(candidate.matches[0].kind).toBe("STRONG_CONFLICT");
    expect(candidate.eligibility.status).toBe("IDENTITY_CONFLICT");
    await assertEligibilityParity(second.result.batchId!, true, false);
    await expect(app.review(reviewer, candidate.id, review("RESOLVE_DISTINCT", 0, candidate.matches[0].id))).rejects.toThrow("CONFLICT");
    expect((await admin.query("select name from acquisition_discovery_candidates order by position, name")).rows).toContainEqual({name: fixtureCandidate().name});
  });
  it("resolves weak findings by appended review and requires evidence for approval", async () => {
    await create(); const second = await create("weak", {domain: "other.example", recordId: "other"});
    const queue = await app.queue(reviewer, null); const finding = queue.candidates.find(c => c.id === second.candidate.id)!.matches[0];
    await app.review(reviewer, second.candidate.id, review("RESOLVE_DISTINCT", 0, finding.id));
    await expect(app.review(reviewer, second.candidate.id, review("APPROVE", 1))).rejects.toThrow("CONFLICT");
    expect((await admin.query("select kind from acquisition_discovery_identity_matches where id=$1", [finding.id])).rows[0].kind).toBe("POSSIBLE_NAME_MATCH");
    expect((await app.batch(intake, second.result.batchId!)).candidates[0].version).toBe(1);
    await assertEligibilityParity(second.result.batchId!, false, false);
  });
  it("projects duplicate decisions as terminal even with unresolved identity findings", async () => {
    await create(); const second = await create("duplicate");
    const candidate = (await app.queue(reviewer, null)).candidates.find(c => c.id === second.candidate.id)!;
    await app.review(reviewer, candidate.id, review("DUPLICATE", 0, candidate.matches[0].id));
    expect((await app.batch(intake, second.result.batchId!)).candidates[0].eligibility.status).toBe("TERMINAL");
    await assertEligibilityParity(second.result.batchId!, true, false);
  });
  it("enforces evidence/finding ownership", async () => {
    await create(); const other = await create("duplicate");
    const first = (await app.queue(reviewer, null)).candidates.find(c => c.id !== other.candidate.id)!;
    const finding = (await app.queue(reviewer, null)).candidates.find(c => c.id === other.candidate.id)!.matches[0];
    await expect(app.review(reviewer, first.id, review("DUPLICATE", 0, finding.id))).rejects.toThrow("CONFLICT");
    await expect(app.evidence(reviewer, randomUUID(), fact("WEBSITE"))).rejects.toThrow("NOT_FOUND");
  });
  it("rejects contradictory concurrent decisions and leaves no partial review", async () => {
    const {candidate} = await create(); await support(candidate.id);
    const results = await Promise.allSettled([app.review(reviewer, candidate.id, review("APPROVE")), app.review(reviewer, candidate.id, review("REJECT"))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await admin.query("select count(*)::int as count from acquisition_discovery_reviews")).rows[0].count).toBe(1);
  });
  it("stores trusted reviewer identity and replays receipts without stale state", async () => {
    const {candidate} = await create(); await support(candidate.id); const input = review("APPROVE");
    const receipt = await app.review(reviewer, candidate.id, input);
    expect(await app.review(reviewer, candidate.id, input)).toEqual(receipt); expect(receipt).not.toHaveProperty("state");
    expect((await admin.query("select reviewer_id from acquisition_discovery_reviews")).rows[0].reviewer_id).toBe(reviewer.id);
    await expect(app.review(reviewer, candidate.id, review("REJECT", 1))).rejects.toThrow("CONFLICT");
  });
  it("blocks suppression bypass across batches, domains and source identities", async () => {
    const first = await create(); await app.review(reviewer, first.candidate.id, review("SUPPRESS"));
    const sameDomain = await create("domain", {recordId: "other"});
    const sameSource = await create("source", {domain: "different.example"});
    expect(sameDomain.candidate.state).toBe("SUPPRESSED"); expect(sameSource.candidate.state).toBe("SUPPRESSED");
    await expect(app.review(reviewer, sameSource.candidate.id, review("APPROVE"))).rejects.toThrow("SUPPRESSED");
    await expect(app.submit(intake, fixtureBatch())).rejects.toThrow("SUPPRESSED");
    expect((await admin.query("select count(*)::int as count from acquisition_discovery_reviews where decision='SUPPRESS'")).rows[0].count).toBe(1);
  });
  it("respects existing domain suppression and does not revive candidates after release", async () => {
    const id = randomUUID();
    await admin.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference) values ($1,'DOMAIN',$2,'MANUAL_REVIEW','discovery-test')", [id, fixtureCandidate().domain]);
    const first = await create(); expect(first.candidate.state).toBe("SUPPRESSED");
    await admin.query("update acquisition_suppression_entries set released_at=now() where id=$1", [id]);
    const second = await create("after-release"); expect(second.candidate.state).toBe("SUPPRESSED");
  });
  it("never extends deadlines through a new batch", async () => {
    const first = await create(); const second = await create("later");
    expect(second.candidate.expiresAt).toBe(first.candidate.expiresAt);
  });
  it("rejects expired policies and candidate advancement while preserving historical status", async () => {
    policy = {...policy, expiresAt: new Date(Date.now() + 350).toISOString()};
    await admin.query("truncate acquisition_discovery_policies"); await provisionPolicy();
    const first = await create();
    await new Promise(resolve => setTimeout(resolve, 400));
    await expect(app.review(reviewer, first.candidate.id, review("APPROVE"))).rejects.toThrow("POLICY_DENIED");
    await expect(app.submit(intake, fixtureBatch())).rejects.toThrow("POLICY_DENIED");
    const status = (await app.batch(intake, first.result.batchId!)).candidates[0]; expect(status.expired).toBe(true); expect(status.policyAllowed).toBe(false);
  });
  it("rejects revoked or changed policy on historical replay", async () => {
    await create(); await alterPolicy("revoked"); policy = {...policy, revoked: true}; await expect(app.submit(intake, fixtureBatch())).rejects.toThrow("POLICY_DENIED");
  });
  it("enforces actual candidate expiry independently of policy expiry", async () => {
    const first = await create();
    // Only the guarded disposable admin can construct an already-expired historical fixture.
    await admin.query("alter table acquisition_discovery_candidates disable trigger acquisition_discovery_candidate_guard");
    try { await admin.query("update acquisition_discovery_candidates set created_at=now()-interval '2 days', expires_at=now()-interval '1 day' where id=$1", [first.candidate.id]); }
    finally { await admin.query("alter table acquisition_discovery_candidates enable trigger acquisition_discovery_candidate_guard"); }
    await expect(app.review(reviewer, first.candidate.id, review("NEEDS_EVIDENCE"))).rejects.toThrow("EXPIRED");
    await expect(app.submit(intake, fixtureBatch())).rejects.toThrow("EXPIRED");
    await expect(create("fresh-key")).rejects.toThrow("EXPIRED");
    expect((await app.batch(intake, first.result.batchId!)).candidates[0].expired).toBe(true);
  });
  it("requires a review transition and complete batch at commit", async () => {
    const first = await create();
    const client = await admin.connect();
    try {
      await client.query("begin"); await client.query("set local role discovery_mutation_owner");
      await client.query("insert into acquisition_discovery_reviews(id,candidate_id,reviewer_id,decision,reason,version,state,created_at) values($1,$2,$3,'REJECT','INSUFFICIENT_EVIDENCE',1,'REJECTED',now())", [randomUUID(), first.candidate.id, reviewer.id]);
      await expect(client.query("commit")).rejects.toThrow("incomplete");
      await client.query("rollback");
      await client.query("begin"); await client.query("set local role discovery_mutation_owner");
      await client.query("insert into acquisition_discovery_batches select $1,principal_id,synthetic,policy_key,policy_version,policy_fingerprint,policy_snapshot,source_identity,method,run_reference,count,created_at from acquisition_discovery_batches where id=$2", [randomUUID(), first.result.batchId]);
      await expect(client.query("commit")).rejects.toThrow("incomplete");
      await client.query("rollback");
    } finally { client.release(); }
    expect((await admin.query("select count(*)::int as count from acquisition_discovery_reviews")).rows[0].count).toBe(0);
  });
  it("scopes batch visibility and operation identity to the principal", async () => {
    const first = await create(); const other: DiscoveryPrincipal = {id: randomUUID(), capability: "INTAKE"};
    await expect(app.batch(other, first.result.batchId!)).rejects.toThrow("FORBIDDEN");
    await expect(app.submit(other, fixtureBatch())).rejects.toThrow("FORBIDDEN");
    // Trusted test provisioning simulates a separate subsequently bound principal.
    await admin.query("delete from acquisition_discovery_principal_bindings where database_role=\'discovery_intake\'");
    await admin.query("insert into acquisition_discovery_principal_bindings(database_role,principal_id,capability) values(\'discovery_intake\',$1,\'INTAKE\')", [other.id]);
    await expect(app.batch(other, first.result.batchId!)).rejects.toThrow("NOT_FOUND");
    const second = await app.submit(other, fixtureBatch()); expect(second.batchId).not.toBe(first.result.batchId);
    expect((await app.batch(reviewer, first.result.batchId!)).batchId).toBe(first.result.batchId);
  });
  it("does not modify canonical tables", async () => {
    const snapshot = async () => (await runtime.query("select (select count(*) from acquisition_companies)::int as companies, (select count(*) from acquisition_company_domains)::int as domains, (select count(*) from acquisition_leads)::int as leads, (select count(*) from acquisition_contacts)::int as contacts, (select count(*) from acquisition_source_identities)::int as identities")).rows;
    const before = await snapshot(); const {candidate} = await create(); await support(candidate.id); await app.review(reviewer, candidate.id, review("APPROVE"));
    expect(await snapshot()).toEqual(before);
  });
});
