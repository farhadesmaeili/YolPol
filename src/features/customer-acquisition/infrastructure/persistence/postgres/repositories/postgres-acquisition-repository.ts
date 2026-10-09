import {createHash, randomUUID} from "node:crypto";
import {and, eq, isNull, sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";
import type {AcquisitionRepository} from "@/features/customer-acquisition/application/ports/acquisition-repository";
import {AcquisitionConflictError, AcquisitionNotFoundError, type AcquisitionResult, type CompanyObservation, type QualificationInput, type ReleaseSuppressionInput, type SuppressionInput} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {scoreFoundation} from "@/features/customer-acquisition/domain/services/foundation-scoring";
import {boundedText, companyNameKey} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";
import {acquisitionSchema, companies, domains, contacts, leads, sourceIdentities, observations, assessments, suppressions, operations} from "@/features/customer-acquisition/infrastructure/persistence/postgres/schema/acquisition-schema";

const createDatabase = (pool: Pool) => drizzle(pool, {schema: acquisitionSchema});
type Transaction = Parameters<Parameters<ReturnType<typeof createDatabase>["transaction"]>[0]>[0];

function hash(value: unknown): string { return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex"); }

export function observationFingerprint(input: CompanyObservation): string {
  // Versioned, fixed-key UTF-8 JSON of extracted facts, independent of retry/run identity.
  return hash({version: 1, company: {name: input.company.name, country: input.company.country, domain: input.company.domain},
    contact: input.contact ? {name: input.contact.name, email: input.contact.normalizedEmail} : null,
    segment: input.segment, source: {system: input.source.system, recordId: input.source.recordId, url: input.source.url, observedAt: input.source.observedAt}});
}

export class PostgresAcquisitionRepository implements AcquisitionRepository {
  private readonly database;
  constructor(pool: Pool) { this.database = createDatabase(pool); }

  async ready(): Promise<boolean> {
    try {
      const result = await this.database.execute(sql`select current_database() = 'yolpol_acquisition' and current_user = 'acquisition_runtime'
        and to_regclass('public.acquisition_operations') is not null as ready`);
      return result.rows[0]?.ready === true;
    } catch { return false; }
  }

  private async operation(kind: string, key: string, fingerprint: string, execute: (tx: Transaction) => Promise<AcquisitionResult>): Promise<AcquisitionResult> {
    return this.database.transaction(async (tx) => {
      await tx.execute(sql`set local lock_timeout = '3s'`);
      await tx.execute(sql`set local statement_timeout = '5s'`);
      // Serialize the small synthetic pilot's identity decisions, including suppression
      // and scoring. SQL uniqueness remains authoritative for all persistent identities.
      await tx.execute(sql`select pg_advisory_xact_lock(820082)`);
      const [existing] = await tx.select().from(operations).where(eq(operations.key, key));
      if (existing) {
        if (existing.kind !== kind || existing.fingerprint !== fingerprint) throw new AcquisitionConflictError();
        return existing.result;
      }
      const result = await execute(tx);
      await tx.insert(operations).values({key, kind, fingerprint, result});
      return result;
    });
  }

  async ingest(observation: CompanyObservation): Promise<AcquisitionResult> {
    // Fingerprints, conflict comparisons and inserts must share the canonical name.
    const input: CompanyObservation = {...observation, contact: observation.contact
      ? {...observation.contact, name: boundedText(observation.contact.name, 160)} : null};
    const nameKey = companyNameKey(input.company.name);
    const fingerprint = observationFingerprint(input);
    return this.operation("INGEST", input.idempotencyKey, fingerprint, async (tx) => {
      const [domain] = await tx.select().from(domains).where(eq(domains.domain, input.company.domain));
      const [provider] = input.source.recordId ? await tx.select().from(sourceIdentities).where(and(eq(sourceIdentities.system, input.source.system), eq(sourceIdentities.recordId, input.source.recordId))) : [];
      const [contact] = input.contact ? await tx.select().from(contacts).where(eq(contacts.normalizedEmail, input.contact.normalizedEmail)) : [];
      const identities = new Set([domain?.companyId, provider?.companyId, contact?.companyId].filter((id): id is string => id !== undefined));
      const [companyId] = identities;
      const [company] = companyId ? await tx.select().from(companies).where(eq(companies.id, companyId)) : [];
      let reason: AcquisitionResult["reason"];
      if (identities.size > 1 || (company && (!domain || company.name !== input.company.name || company.country !== input.company.country)) || (contact && contact.name !== input.contact?.name)) reason = "IDENTITY_CONFLICT";
      if (!company && !reason) {
        const matches = await tx.select({id: companies.id}).from(companies).where(and(eq(companies.nameKey, nameKey), eq(companies.country, input.company.country))).limit(1);
        if (matches.length) reason = "POSSIBLE_NAME_MATCH";
      }
      const observationId = randomUUID();
      const provenance = {system: input.source.system, recordId: input.source.recordId, url: input.source.url, observedAt: new Date(input.source.observedAt),
        runReference: input.source.runReference, fingerprint};
      if (reason) {
        await tx.insert(observations).values({id: observationId, ...provenance, idempotencyKey: input.idempotencyKey, outcome: "REVIEW_REQUIRED"});
        return {status: "REVIEW_REQUIRED", observationId, reason};
      }
      const resolvedCompanyId = company?.id ?? randomUUID();
      if (!company) {
        await tx.insert(companies).values({id: resolvedCompanyId, name: input.company.name, nameKey, country: input.company.country});
        await tx.insert(domains).values({domain: input.company.domain, companyId: resolvedCompanyId, primary: true});
      }
      if (input.source.recordId && !provider) await tx.insert(sourceIdentities).values({id: randomUUID(), system: input.source.system, recordId: input.source.recordId, companyId: resolvedCompanyId});
      let resolvedContactId = contact?.id;
      if (input.contact && !contact) {
        resolvedContactId = randomUUID();
        await tx.insert(contacts).values({id: resolvedContactId, companyId: resolvedCompanyId, name: input.contact.name, originalEmail: input.contact.email, normalizedEmail: input.contact.normalizedEmail});
      }
      const [existingLead] = await tx.select().from(leads).where(and(eq(leads.companyId, resolvedCompanyId), eq(leads.segment, input.segment)));
      const leadId = existingLead?.id ?? randomUUID();
      if (!existingLead) await tx.insert(leads).values({id: leadId, companyId: resolvedCompanyId, segment: input.segment});
      // An observation containing a contact targets that contact; its company is reached
      // through the immutable contact association. Company-only observations target it directly.
      await tx.insert(observations).values({id: observationId, ...provenance, idempotencyKey: input.idempotencyKey, outcome: "ACCEPTED",
        companyId: resolvedContactId ? null : resolvedCompanyId, contactId: resolvedContactId ?? null});
      return {status: company ? "EXISTING" : "CREATED", companyId: resolvedCompanyId, ...(resolvedContactId ? {contactId: resolvedContactId} : {}), leadId, observationId};
    });
  }

  async qualify(input: QualificationInput): Promise<AcquisitionResult> {
    const fingerprint = hash({version: 1, leadId: input.leadId, policyVersion: input.policyVersion,
      facts: {marketMatch: input.facts.marketMatch, segmentMatch: input.facts.segmentMatch, packagingRelevance: input.facts.packagingRelevance}});
    return this.operation("QUALIFY", input.idempotencyKey, fingerprint, async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId));
      if (!lead) throw new AcquisitionNotFoundError();
      const active = await tx.execute(sql`select 1 from acquisition_suppression_entries s where s.released_at is null and (
        (s.kind = 'DOMAIN' and exists (select 1 from acquisition_company_domains d where d.company_id = ${lead.companyId}::uuid and d.domain = s.target)) or
        exists (select 1 from acquisition_contacts c where c.company_id = ${lead.companyId}::uuid and
          ((s.kind = 'EMAIL' and c.normalized_email = s.target) or (s.kind = 'DOMAIN' and split_part(c.normalized_email, '@', 2) = s.target)))) limit 1`);
      const result = scoreFoundation(input.facts, active.rows.length > 0);
      const assessmentId = randomUUID();
      await tx.insert(assessments).values({id: assessmentId, leadId: lead.id, policyVersion: input.policyVersion, ...input.facts, ...result, idempotencyKey: input.idempotencyKey});
      await tx.update(leads).set({state: result.decision === "FOUNDATION_FIT" ? "ASSESSED" : "REVIEW_REQUIRED"}).where(eq(leads.id, lead.id));
      return {status: "ASSESSED", leadId: lead.id, assessmentId, score: result.score, decision: result.decision};
    });
  }

  async suppress(input: SuppressionInput): Promise<AcquisitionResult> {
    return this.operation("SUPPRESS", input.idempotencyKey, hash({version: 1, kind: input.kind, target: input.target, reason: input.reason, sourceReference: input.sourceReference}), async (tx) => {
      const [active] = await tx.select().from(suppressions).where(and(eq(suppressions.kind, input.kind), eq(suppressions.target, input.target), isNull(suppressions.releasedAt)));
      const suppressionId = active?.id ?? randomUUID();
      if (!active) await tx.insert(suppressions).values({id: suppressionId, kind: input.kind, target: input.target, reason: input.reason, sourceReference: input.sourceReference});
      return {status: "SUPPRESSED", suppressionId};
    });
  }

  async release(input: ReleaseSuppressionInput): Promise<AcquisitionResult> {
    return this.operation("RELEASE", input.idempotencyKey, hash({version: 1, suppressionId: input.suppressionId}), async (tx) => {
      const [entry] = await tx.select().from(suppressions).where(eq(suppressions.id, input.suppressionId));
      if (!entry) throw new AcquisitionNotFoundError();
      if (!entry.releasedAt) await tx.update(suppressions).set({releasedAt: new Date()}).where(eq(suppressions.id, entry.id));
      return {status: "RELEASED", suppressionId: entry.id};
    });
  }
}
