import {randomUUID} from "node:crypto";
import {resolve} from "node:path";
import {afterAll, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {Pool} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {migrate} from "drizzle-orm/node-postgres/migrator";
import {acquisitionDatabaseConfig, readAcquisitionSecret} from "@/features/customer-acquisition/infrastructure/config/acquisition-config";
import {PostgresAcquisitionRepository, observationFingerprint} from "@/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-acquisition-repository";
import {parseObservation, parseQualification, parseSuppression} from "@/features/customer-acquisition/infrastructure/validation/acquisition-input";
import {syntheticObservation} from "@/features/customer-acquisition/testing/fixtures/acquisition-fixtures";
import {CustomerAcquisition} from "@/features/customer-acquisition/application/use-cases/customer-acquisition";
import {AcquisitionValidationError} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {createAcquisitionHandler} from "@/features/customer-acquisition/infrastructure/http/acquisition-handler";
import {presentAcquisitionResult} from "@/features/customer-acquisition/presentation/presenters/acquisition-result-presenter";

// Ordinary YOLPOL integration runs do not have acquisition credentials or networks.
describe.runIf(process.env.ACQUISITION_DISPOSABLE_TEST === "true")("disposable acquisition PostgreSQL", () => {
  let admin: Pool; let runtime: Pool; let repository: PostgresAcquisitionRepository;
  beforeAll(async () => {
    const config = acquisitionDatabaseConfig(process.env, "migration");
    admin = new Pool({...config, user: "acquisition_admin", password: readAcquisitionSecret(process.env.ACQUISITION_ADMIN_PASSWORD_FILE)});
    const marker = await admin.query("select current_database() as name, pg_read_file('/disposable-task0082') as marker");
    if (marker.rows[0].name !== "yolpol_acquisition" || marker.rows[0].marker.trim() !== "task0082-tmpfs") throw new Error("Disposable acquisition safety marker absent.");
    const migrator = new Pool(config);
    try { await migrate(drizzle(migrator), {migrationsFolder: resolve("drizzle-customer-acquisition")}); }
    finally { await migrator.end(); }
    runtime = new Pool(acquisitionDatabaseConfig(process.env, "runtime"));
    repository = new PostgresAcquisitionRepository(runtime);
  });
  beforeEach(async () => {
    await admin.query("truncate acquisition_operations, acquisition_qualification_assessments, acquisition_source_observations, acquisition_source_identities, acquisition_suppression_entries, acquisition_leads, acquisition_contacts, acquisition_company_domains, acquisition_companies");
  });
  afterAll(async () => { await runtime?.end(); await admin?.end(); });

  it("ACQ-01 stores boundary Unicode without truncation and preserves canonical replay/deduplication", async () => {
    const name = `\u00e9${"\u0130".repeat(78)}A\u{1f600}`;
    const original = syntheticObservation({company: {name, country: "TR", domain: "bottler.example"}, contact: {name: "\u{1f600}".repeat(80), email: "Test@bottler.example"}});
    const input = parseObservation(original);
    const first = await repository.ingest(input);
    const canonicalVariant = parseObservation({...original, company: {...original.company, name: name.replace("\u00e9", "e\u0301")}});
    expect(await repository.ingest(canonicalVariant)).toEqual(first);
    expect(await repository.ingest({...canonicalVariant, idempotencyKey: "unicode-observation-2"})).toMatchObject({status: "EXISTING", companyId: first.companyId, contactId: first.contactId, leadId: first.leadId});
    const stored = await runtime.query("select name, name_key, char_length(name) as name_length, char_length(name_key) as key_length from acquisition_companies where id=$1", [first.companyId]);
    expect(stored.rows[0]).toEqual({name, name_key: `\u00e9${"i\u0307".repeat(78)}a\u{1f600}`, name_length: 81, key_length: 159});
    const contact = await runtime.query("select name, char_length(name) as length from acquisition_contacts where id=$1", [first.contactId]);
    expect(contact.rows[0]).toEqual({name: "\u{1f600}".repeat(80), length: 80});
    await expect(repository.ingest({...input, idempotencyKey: "invalid-unicode", company: {...input.company, name: "\u0130".repeat(160)}})).rejects.toBeInstanceOf(AcquisitionValidationError);
    expect((await runtime.query("select count(*)::int as count from acquisition_operations")).rows[0].count).toBe(2);
  });
  it.each([
    ["ASCII boundary", "A".repeat(160), "A".repeat(160)],
    ["supplementary boundary", "\u{1f600}".repeat(80), "\u{1f600}".repeat(80)],
    ["NFC expansion boundary", "\u0344".repeat(80), "\u0308\u0301".repeat(80)],
    ["mixed Unicode", " Cafe\u0301 \u0130 \u{1f600} ", "Caf\u00e9 \u0130 \u{1f600}"],
  ])("ACQ-01 stores direct contact %s canonically without truncation", async (_label, name, expected) => {
    const input = {...parseObservation(syntheticObservation()), contact: {name, email: "Test@bottler.example", normalizedEmail: "Test@bottler.example"}};
    const result = await repository.ingest(input);
    expect(result.status).toBe("CREATED");
    expect((await runtime.query("select name from acquisition_contacts where id=$1", [result.contactId])).rows).toEqual([{name: expected}]);
    const canonical = parseObservation(syntheticObservation({contact: {name, email: input.contact.email}}));
    expect((await runtime.query("select fingerprint from acquisition_operations where key=$1", [input.idempotencyKey])).rows).toEqual([{fingerprint: observationFingerprint(canonical)}]);
    expect(input.contact.name).toBe(name);
  });

  it.each(["direct", "http"])("ACQ-01 preserves contact replay, deduplication and provenance after %s-first ingestion", async (firstBoundary) => {
    const canonical = parseObservation(syntheticObservation({contact: {name: "Caf\u00e9", email: "Test@bottler.example"}}));
    const direct = {...canonical, contact: {name: " Cafe\u0301 ", email: "Test@bottler.example", normalizedEmail: "Test@bottler.example"}};
    const first = await repository.ingest(firstBoundary === "direct" ? direct : canonical);
    const retry = firstBoundary === "direct" ? canonical : direct;
    expect(await repository.ingest({...retry, source: {...retry.source, runReference: "retry-run"}})).toEqual(first);
    const next = await repository.ingest({...direct, idempotencyKey: "contact-next", source: {...direct.source, runReference: "next-run"}});
    expect(next).toMatchObject({status: "EXISTING", companyId: first.companyId, contactId: first.contactId, leadId: first.leadId});
    const fingerprint = observationFingerprint(canonical);
    expect((await runtime.query("select idempotency_key, fingerprint, run_reference, system, record_id, url, observed_at, company_id, contact_id from acquisition_source_observations order by idempotency_key")).rows).toEqual([
      {idempotency_key: "contact-next", fingerprint, run_reference: "next-run", system: canonical.source.system, record_id: canonical.source.recordId, url: canonical.source.url, observed_at: new Date(canonical.source.observedAt), company_id: null, contact_id: first.contactId},
      {idempotency_key: canonical.idempotencyKey, fingerprint, run_reference: canonical.source.runReference, system: canonical.source.system, record_id: canonical.source.recordId, url: canonical.source.url, observed_at: new Date(canonical.source.observedAt), company_id: null, contact_id: first.contactId},
    ]);
    expect((await runtime.query("select key, fingerprint, result from acquisition_operations order by key")).rows).toEqual([
      {key: "contact-next", fingerprint, result: next}, {key: canonical.idempotencyKey, fingerprint, result: first},
    ]);
    const changed = {...direct, contact: {...direct.contact, name: "Different Synthetic Contact"}};
    await expect(repository.ingest(changed)).rejects.toThrow("conflicts");
    expect(await repository.ingest({...changed, idempotencyKey: "contact-conflict"})).toMatchObject({status: "REVIEW_REQUIRED", reason: "IDENTITY_CONFLICT"});
    expect((await runtime.query("select name from acquisition_contacts")).rows).toEqual([{name: "Caf\u00e9"}]);
    expect((await runtime.query("select count(*)::int as count from acquisition_companies")).rows[0].count).toBe(1);
    expect((await runtime.query("select count(*)::int as count from acquisition_leads")).rows[0].count).toBe(1);
    expect((await runtime.query("select count(*)::int as count from acquisition_source_identities")).rows[0].count).toBe(1);
  });

  it("ACQ-01 rejects direct expanded contact names without partial records", async () => {
    const input = parseObservation(syntheticObservation());
    for (const name of ["\u0344".repeat(160), "\u0308\u0301".repeat(160), `${"Q".repeat(159)}\u0344`]) {
      await expect(repository.ingest({...input, contact: {name, email: "Test@bottler.example", normalizedEmail: "Test@bottler.example"}})).rejects.toBeInstanceOf(AcquisitionValidationError);
    }
    for (const table of ["acquisition_companies", "acquisition_company_domains", "acquisition_contacts", "acquisition_leads", "acquisition_source_identities", "acquisition_source_observations", "acquisition_operations"]) {
      expect((await runtime.query(`select count(*)::int as count from ${table}`)).rows[0].count).toBe(0);
    }
  });

  it("ACQ-01 retains null-contact ingestion and company-targeted provenance", async () => {
    const input = parseObservation(syntheticObservation());
    expect(input.contact).toBeNull();
    const first = await repository.ingest(input);
    expect(first.status).toBe("CREATED");
    expect(first.contactId).toBeUndefined();
    expect(await repository.ingest({...input, contact: null})).toEqual(first);
    expect((await runtime.query("select count(*)::int as count from acquisition_contacts")).rows[0].count).toBe(0);
    expect((await runtime.query("select company_id, contact_id, fingerprint from acquisition_source_observations")).rows).toEqual([{company_id: first.companyId, contact_id: null, fingerprint: observationFingerprint(input)}]);
  });

  it("ACQ-02 keeps real duplicate-key failures observable but sanitizes the API response", async () => {
    const seed = process.env.ACQUISITION_LOG_SENTINEL ?? randomUUID().replaceAll("-", "");
    if (!/^[a-f0-9]{32}$/u.test(seed)) throw new Error("Invalid disposable log sentinel.");
    const domain = `log-${seed}.example`; const email = `log-${seed}@example.test`;
    const input = parseObservation(syntheticObservation({company: {name: "Synthetic Log Probe", country: "TR", domain}, contact: {name: "Synthetic Contact", email}}));
    const first = await repository.ingest(input);
    await expect(runtime.query("insert into acquisition_company_domains(domain,company_id,is_primary) values ($1,$2,false)", [domain, first.companyId])).rejects.toMatchObject({code: "23505"});
    const fields: unknown[] = []; let sqlState: unknown;
    const application = new CustomerAcquisition({
      ingest: async () => {
        try { await runtime.query("insert into acquisition_contacts(id,company_id,name,original_email,normalized_email) values ($1,$2,'Synthetic',$3,$3)", [randomUUID(), first.companyId, email]); }
        catch (error) { sqlState = typeof error === "object" && error !== null && "code" in error ? error.code : undefined; throw error; }
        throw new Error("Expected unique constraint failure.");
      },
      qualify: (value) => repository.qualify(value), suppress: (value) => repository.suppress(value), release: (value) => repository.release(value), ready: () => repository.ready(),
    });
    const token = randomUUID();
    const handler = createAcquisitionHandler({application, token, requestId: () => "log-privacy-request", present: presentAcquisitionResult, log: (value) => { fields.push(value); }});
    const response = await handler(new Request("http://internal/v1/observations", {method: "POST", headers: {authorization: `Bearer ${token}`, "content-type": "application/json"}, body: JSON.stringify(syntheticObservation())}));
    expect(sqlState).toBe("23505");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({requestId: "log-privacy-request", error: "UNAVAILABLE"});
    expect(fields).toEqual([{requestId: "log-privacy-request", status: 503, durationMs: expect.any(Number)}]);
    expect(await repository.ready()).toBe(true);
  });

  it("migrates independently and uses a non-owner restricted runtime role", async () => {
    expect(await repository.ready()).toBe(true);
    const result = await runtime.query("select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname = current_user");
    expect(result.rows[0]).toEqual({rolsuper: false, rolcreatedb: false, rolcreaterole: false});
    await expect(runtime.query("create table forbidden(id int)")).rejects.toMatchObject({code: "42501"});
    await expect(runtime.query("select * from drizzle.__drizzle_migrations")).rejects.toMatchObject({code: "42501"});
    const owners = await admin.query("select distinct tableowner from pg_tables where schemaname='public'");
    expect(owners.rows).toEqual([{tableowner: "acquisition_migrator"}]);
    const migratorRole = await admin.query("select rolsuper, rolcreatedb, rolcreaterole from pg_roles where rolname='acquisition_migrator'");
    expect(migratorRole.rows[0]).toEqual({rolsuper: false, rolcreatedb: false, rolcreaterole: false});
    const tables = await runtime.query("select tablename from pg_tables where schemaname='public'");
    expect(tables.rows.map(row => row.tablename).sort()).toEqual([
      "acquisition_companies", "acquisition_company_domains", "acquisition_contacts", "acquisition_leads",
      "acquisition_source_identities", "acquisition_source_observations", "acquisition_qualification_assessments",
      "acquisition_suppression_entries", "acquisition_operations",
      "acquisition_discovery_batches", "acquisition_discovery_candidates", "acquisition_discovery_evidence",
      "acquisition_discovery_identity_matches", "acquisition_discovery_reviews", "acquisition_discovery_operations",
      "acquisition_discovery_principal_bindings", "acquisition_discovery_policies",
      "acquisition_discovery_suppression_marks",
    ].sort());
    expect(tables.rows.every((row) => row.tablename.startsWith("acquisition_"))).toBe(true);
  });
  it("returns the exact winner for concurrent identical keys", async () => {
    const input = parseObservation(syntheticObservation());
    const results = await Promise.all(Array.from({length: 8}, () => repository.ingest(input)));
    for (const result of results) expect(result).toEqual(results[0]);
    expect((await admin.query("select * from acquisition_companies")).rowCount).toBe(1);
    expect((await admin.query("select * from acquisition_source_observations")).rowCount).toBe(1);
  });
  it("rejects conflicting key reuse without changing the original", async () => {
    const input = parseObservation(syntheticObservation());
    const first = await repository.ingest(input);
    await expect(repository.ingest({...input, segment: "other-segment"})).rejects.toThrow("conflicts");
    expect(await repository.ingest(input)).toEqual(first);
  });
  it("deduplicates concurrent different keys and retains each observation", async () => {
    const input = parseObservation(syntheticObservation());
    const results = await Promise.all(Array.from({length: 8}, (_, n) => repository.ingest({...input, idempotencyKey: `key-${n}`})));
    expect(new Set(results.map((result) => result.companyId)).size).toBe(1);
    expect(new Set(results.map((result) => result.leadId)).size).toBe(1);
    expect((await admin.query("select * from acquisition_source_observations")).rowCount).toBe(8);
  });
  it("records ambiguous names and conflicting provider identities for review without merging", async () => {
    const input = parseObservation(syntheticObservation());
    await repository.ingest(input);
    const similar = {...input, idempotencyKey: "similar", company: {...input.company, domain: "another.example"}, source: {...input.source, recordId: "other"}};
    expect(await repository.ingest(similar)).toMatchObject({status: "REVIEW_REQUIRED", reason: "POSSIBLE_NAME_MATCH"});
    expect(await repository.ingest({...similar, idempotencyKey: "conflict", source: input.source})).toMatchObject({status: "REVIEW_REQUIRED", reason: "IDENTITY_CONFLICT"});
    expect((await admin.query("select * from acquisition_companies")).rowCount).toBe(1);
    expect((await admin.query("select * from acquisition_source_observations where outcome='REVIEW_REQUIRED'")).rowCount).toBe(2);
  });
  it("scopes provider identifiers by source and preserves repeated source provenance", async () => {
    const input = parseObservation(syntheticObservation());
    const first = await repository.ingest(input);
    const second = await repository.ingest({...input, idempotencyKey: "source2", source: {...input.source, system: "another-source"}, company: {...input.company, name: "Synthetic Second", domain: "second.example"}});
    expect(first.companyId).not.toBe(second.companyId);
    const repeated = await repository.ingest({...input, idempotencyKey: "repeat", source: {...input.source, runReference: "run2"}});
    expect(repeated.companyId).toBe(first.companyId);
    expect((await admin.query("select * from acquisition_source_identities")).rowCount).toBe(2);
  });
  it("protects email/domain/company-segment uniqueness in PostgreSQL", async () => {
    const input = parseObservation(syntheticObservation({contact: {name: "Synthetic Contact", email: "Contact@bottler.example"}}));
    const first = await repository.ingest(input);
    await expect(runtime.query("insert into acquisition_company_domains(domain,company_id,is_primary) values ($1,$2,false)", [input.company.domain, first.companyId])).rejects.toMatchObject({code: "23505"});
    await expect(runtime.query("insert into acquisition_contacts(id,company_id,name,original_email,normalized_email) values ($1,$2,'Synthetic',$3,$3)", [randomUUID(), first.companyId, input.contact!.normalizedEmail])).rejects.toMatchObject({code: "23505"});
    await expect(runtime.query("insert into acquisition_leads(id,company_id,segment) values ($1,$2,$3)", [randomUUID(), first.companyId, input.segment])).rejects.toMatchObject({code: "23505"});
    const second = await repository.ingest({...input, idempotencyKey: "email-conflict", company: {...input.company, name: "Synthetic Other", domain: "other.example"}, source: {...input.source, recordId: "other"}});
    expect(second).toMatchObject({status: "REVIEW_REQUIRED", reason: "IDENTITY_CONFLICT"});
    expect((await admin.query("select * from acquisition_contacts")).rowCount).toBe(1);
  });
  it("makes provenance, source mapping and operation results immutable to runtime", async () => {
    const result = await repository.ingest(parseObservation(syntheticObservation()));
    for (const table of ["acquisition_source_observations", "acquisition_source_identities", "acquisition_operations"]) {
      await expect(runtime.query(`delete from ${table}`)).rejects.toMatchObject({code: "42501"});
    }
    await expect(runtime.query("update acquisition_source_observations set fingerprint = repeat('0',64) where id=$1", [result.observationId])).rejects.toMatchObject({code: "42501"});
    const input = parseObservation(syntheticObservation());
    expect(observationFingerprint(input)).toBe(observationFingerprint({...input, idempotencyKey: "other", source: {...input.source, runReference: "other-run"}}));
    expect(observationFingerprint(input)).not.toBe(observationFingerprint({...input, segment: "different-segment"}));
  });
  it("appends versioned scoring and blocks qualification for domain and email suppression", async () => {
    const result = await repository.ingest(parseObservation(syntheticObservation({contact: {name: "Synthetic", email: "contact@bottler.example"}})));
    const input = parseQualification({idempotencyKey: "q1", leadId: result.leadId, policyVersion: "foundation-v1", facts: {marketMatch: true, segmentMatch: true, packagingRelevance: true}});
    expect(await repository.qualify(input)).toMatchObject({score: 100, decision: "FOUNDATION_FIT"});
    await repository.suppress(parseSuppression({idempotencyKey: "s1", kind: "EMAIL", target: "contact@bottler.example", reason: "TEST_OPT_OUT", sourceReference: "synthetic"}));
    expect(await repository.qualify({...input, idempotencyKey: "q2"})).toMatchObject({score: 100, decision: "BLOCKED"});
    expect(await repository.qualify(input)).toMatchObject({decision: "FOUNDATION_FIT"});
    expect((await admin.query("select * from acquisition_qualification_assessments")).rowCount).toBe(2);
    await expect(runtime.query("update acquisition_qualification_assessments set score=0")).rejects.toMatchObject({code: "42501"});
    await expect(runtime.query("insert into acquisition_qualification_assessments(id,lead_id,policy_version,market_match,segment_match,packaging_relevance,score,decision,reasons,idempotency_key) values ($1,$2,'foundation-v1',true,true,true,101,'FOUNDATION_FIT',array['MARKET_MATCH'],'bad')", [randomUUID(), result.leadId])).rejects.toMatchObject({code: "23514"});
  });
  it("serializes active suppression, releases once and allows a new historical entry", async () => {
    const input = parseSuppression({idempotencyKey: "s1", kind: "DOMAIN", target: "bottler.example", reason: "TEST_OPT_OUT", sourceReference: "synthetic"});
    const results = await Promise.all([repository.suppress(input), repository.suppress({...input, idempotencyKey: "s2"})]);
    expect(results[0].suppressionId).toBe(results[1].suppressionId);
    await expect(runtime.query("insert into acquisition_suppression_entries(id,kind,target,reason,source_reference) values ($1,'DOMAIN','bottler.example','MANUAL_REVIEW','synthetic')", [randomUUID()])).rejects.toMatchObject({code: "23505"});
    const released = await repository.release({idempotencyKey: "r1", suppressionId: results[0].suppressionId!});
    expect(await repository.release({idempotencyKey: "r1", suppressionId: results[0].suppressionId!})).toEqual(released);
    await expect(runtime.query("update acquisition_suppression_entries set released_at=null")).rejects.toMatchObject({code: "P0001"});
    expect((await repository.suppress({...input, idempotencyKey: "s3"})).suppressionId).not.toBe(results[0].suppressionId);
    expect((await admin.query("select * from acquisition_suppression_entries")).rowCount).toBe(2);
  });
  it("applies domain suppression until release and preserves historical decisions", async () => {
    const result = await repository.ingest(parseObservation(syntheticObservation()));
    const qualification = parseQualification({idempotencyKey: "domain-q1", leadId: result.leadId, policyVersion: "foundation-v1", facts: {marketMatch: true, segmentMatch: true, packagingRelevance: true}});
    const suppression = await repository.suppress(parseSuppression({idempotencyKey: "domain-s1", kind: "DOMAIN", target: "BOTTLER.EXAMPLE.", reason: "TEST_OPT_OUT", sourceReference: "synthetic"}));
    expect(await repository.qualify(qualification)).toMatchObject({decision: "BLOCKED"});
    await repository.release({idempotencyKey: "domain-r1", suppressionId: suppression.suppressionId!});
    expect(await repository.qualify({...qualification, idempotencyKey: "domain-q2"})).toMatchObject({decision: "FOUNDATION_FIT"});
    expect(await repository.qualify(qualification)).toMatchObject({decision: "BLOCKED"});
  });
  it("deduplicates canonical domain and email variants without changing accepted facts", async () => {
    const original = syntheticObservation({contact: {name: "Synthetic", email: "Contact@BOTTLER.EXAMPLE."}});
    const first = await repository.ingest(parseObservation(original));
    const replay = await repository.ingest(parseObservation({...original, company: {...original.company, domain: "BOTTLER.EXAMPLE."}, contact: {name: "Synthetic", email: "Contact@bottler.example"}}));
    expect(replay).toEqual(first);
    expect((await admin.query("select * from acquisition_contacts")).rowCount).toBe(1);
    expect((await admin.query("select * from acquisition_source_observations")).rowCount).toBe(1);
  });
});
