import {AcquisitionValidationError, type CompanyObservation, type QualificationInput, type SuppressionInput} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {boundedText, companyNameKey, countryCode, identifier, normalizeDomain, normalizeEmail, observationTime, requireSyntheticDomain, segmentKey, sourceUrl} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";

function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new AcquisitionValidationError();
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key)) || required.some((key) => !Object.hasOwn(result, key))) throw new AcquisitionValidationError();
  return result;
}

export function parseObservation(value: unknown): CompanyObservation {
  const input = object(value, ["synthetic", "idempotencyKey", "company", "segment", "source"], ["contact"]);
  if (input.synthetic !== true) throw new AcquisitionValidationError();
  const company = object(input.company, ["name", "country", "domain"]);
  const name = boundedText(company.name, 160);
  companyNameKey(name); // Validate the derived persistent identity before calling the application.
  const source = object(input.source, ["system", "observedAt", "runReference"], ["recordId", "url"]);
  let contact: CompanyObservation["contact"] = null;
  if (input.contact !== undefined) {
    const data = object(input.contact, ["name", "email"]);
    const email = normalizeEmail(data.email);
    requireSyntheticDomain(email.normalized.split("@")[1]);
    contact = {name: boundedText(data.name, 160), email: email.original, normalizedEmail: email.normalized};
  }
  return {synthetic: true, idempotencyKey: identifier(input.idempotencyKey),
    company: {name, country: countryCode(company.country), domain: requireSyntheticDomain(normalizeDomain(company.domain))},
    contact, segment: segmentKey(input.segment), source: {system: segmentKey(source.system),
      recordId: source.recordId === undefined ? null : identifier(source.recordId),
      url: source.url === undefined ? null : sourceUrl(source.url), observedAt: observationTime(source.observedAt), runReference: identifier(source.runReference)}};
}

export function parseQualification(value: unknown): QualificationInput {
  const input = object(value, ["idempotencyKey", "leadId", "policyVersion", "facts"]);
  const facts = object(input.facts, ["marketMatch", "segmentMatch", "packagingRelevance"]);
  if (input.policyVersion !== "foundation-v1" || typeof facts.marketMatch !== "boolean" || typeof facts.segmentMatch !== "boolean" || typeof facts.packagingRelevance !== "boolean") throw new AcquisitionValidationError();
  return {idempotencyKey: identifier(input.idempotencyKey), leadId: uuid(input.leadId), policyVersion: input.policyVersion,
    facts: {marketMatch: facts.marketMatch, segmentMatch: facts.segmentMatch, packagingRelevance: facts.packagingRelevance}};
}

export function uuid(value: unknown): string {
  const result = identifier(value);
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(result)) throw new AcquisitionValidationError();
  return result;
}

export function parseSuppression(value: unknown): SuppressionInput {
  const input = object(value, ["idempotencyKey", "kind", "target", "reason", "sourceReference"]);
  if ((input.kind !== "DOMAIN" && input.kind !== "EMAIL") || (input.reason !== "TEST_OPT_OUT" && input.reason !== "MANUAL_REVIEW")) throw new AcquisitionValidationError();
  const target = input.kind === "DOMAIN" ? requireSyntheticDomain(normalizeDomain(input.target)) : normalizeEmail(input.target).normalized;
  if (input.kind === "EMAIL") requireSyntheticDomain(target.split("@")[1]);
  return {idempotencyKey: identifier(input.idempotencyKey), kind: input.kind, target, reason: input.reason, sourceReference: identifier(input.sourceReference)};
}

export function parseRelease(value: unknown) {
  const input = object(value, ["idempotencyKey", "suppressionId"]);
  return {idempotencyKey: identifier(input.idempotencyKey), suppressionId: uuid(input.suppressionId)};
}
