import type {DiscoverySourceRegistry} from "@/features/customer-acquisition/application/ports/discovery-source-registry";
import type {DiscoveryPolicy} from "@/features/customer-acquisition/domain/types/discovery-types";

const policies: readonly DiscoveryPolicy[] = ["ege-exporters", "tobb-registry", "official-company-websites"].map(key => Object.freeze({
  key, version: "review-1", sourceIdentity: key, status: "REQUIRES_REVIEW", method: "UNAPPROVED",
  allowedFields: Object.freeze([]), authority: "unassigned", evidenceReference: "unapproved",
  reviewedAt: "2026-10-09T00:00:00.000Z", effectiveAt: "2026-10-09T00:00:00.000Z",
  expiresAt: "2026-10-09T00:00:00.000Z", revoked: false, retentionDays: 0,
} as const));

export const runtimeDiscoverySourceRegistry: DiscoverySourceRegistry = Object.freeze({
  find: (key: string, version: string) => policies.find(policy => policy.key === key && policy.version === version),
});
