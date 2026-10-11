import {DiscoveryError, type DiscoveryPolicy} from "@/features/customer-acquisition/domain/types/discovery-types";
import {boundedText, identifier, observationTime, segmentKey} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";

export function assertDiscoveryPolicy(policy: DiscoveryPolicy | undefined, now: Date): asserts policy is DiscoveryPolicy {
  if (!policy || policy.status !== "APPROVED" || policy.revoked || policy.method !== "SYNTHETIC_FIXTURE") throw new DiscoveryError("POLICY_DENIED");
  try {
    segmentKey(policy.key); identifier(policy.version); identifier(policy.sourceIdentity);
    identifier(policy.authority); identifier(policy.evidenceReference);
    observationTime(policy.reviewedAt); observationTime(policy.effectiveAt); observationTime(policy.expiresAt);
    const allowed = ["name", "country", "domain", "recordId", "segment", "url", "observedAt"];
    if (policy.allowedFields.length !== allowed.length || new Set(policy.allowedFields).size !== allowed.length || allowed.some(field => !policy.allowedFields.includes(field))) throw new Error();
    for (const field of policy.allowedFields) boundedText(field, 32);
    if (!Number.isInteger(policy.retentionDays) || policy.retentionDays < 1 || policy.retentionDays > 7 ||
      !Number.isFinite(now.getTime()) || new Date(policy.reviewedAt) > now || new Date(policy.effectiveAt) > now || new Date(policy.expiresAt) <= now) throw new Error();
  } catch { throw new DiscoveryError("POLICY_DENIED"); }
}

export function discoveryDeadline(policy: DiscoveryPolicy, now: Date, prior: readonly Date[]): Date {
  const deadline = new Date(Math.min(now.getTime() + Math.min(policy.retentionDays, 7) * 86400000, new Date(policy.expiresAt).getTime(), ...prior.map(date => date.getTime())));
  if (deadline <= now) throw new DiscoveryError("EXPIRED");
  return deadline;
}

// Fixed order is also used for the persisted cryptographic policy fingerprint.
export function canonicalDiscoveryPolicy(policy: DiscoveryPolicy): string {
  return JSON.stringify({key: policy.key, version: policy.version, sourceIdentity: policy.sourceIdentity, status: policy.status,
    method: policy.method, allowedFields: [...policy.allowedFields].sort(), authority: policy.authority,
    evidenceReference: policy.evidenceReference, reviewedAt: policy.reviewedAt, effectiveAt: policy.effectiveAt,
    expiresAt: policy.expiresAt, revoked: policy.revoked, retentionDays: policy.retentionDays});
}
