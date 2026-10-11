import {describe, expect, it} from "vitest";
import {assertDiscoveryPolicy, discoveryDeadline} from "@/features/customer-acquisition/domain/services/discovery-source-policy";
import {assertReviewTransition, identityFinding} from "@/features/customer-acquisition/domain/services/discovery-review-policy";
import {fixturePolicy, fixtureCandidate} from "@/features/customer-acquisition/testing/fixtures/discovery-fixtures";
import {fixtureRegistry} from "@/features/customer-acquisition/testing/fakes/discovery-source-registry";

describe("discovery domain policy", () => {
  it("accepts only a current complete synthetic policy", () => {
    expect(() => assertDiscoveryPolicy(fixtureRegistry.find(fixturePolicy.key, fixturePolicy.version), new Date("2026-10-09T00:00:00Z"))).not.toThrow();
    for (const policy of [undefined, {...fixturePolicy, status: "REQUIRES_REVIEW" as const}, {...fixturePolicy, revoked: true}, {...fixturePolicy, expiresAt: "2026-10-08T00:00:00.000Z"}]) {
      expect(() => assertDiscoveryPolicy(policy, new Date("2026-10-09T00:00:00Z"))).toThrow();
    }
  });
  it("caps deadlines and never extends an earlier observation", () => {
    const now = new Date("2026-10-09T00:00:00Z");
    expect(discoveryDeadline(fixturePolicy, now, [new Date("2026-10-10T00:00:00Z")]).toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(discoveryDeadline(fixturePolicy, now, []).getTime() - now.getTime()).toBeLessThanOrEqual(7 * 86400000);
  });
  it("distinguishes exact identity, conflicting facts and weak name matches", () => {
    const a = fixtureCandidate();
    expect(identityFinding(a, a, "fixture", "fixture")).toBe("EXACT_DUPLICATE");
    expect(identityFinding(a, {...a, name: "Synthetic Different"}, "fixture", "fixture")).toBe("STRONG_CONFLICT");
    expect(identityFinding(a, {...a, domain: "other.example", recordId: "other"}, "fixture", "fixture")).toBe("POSSIBLE_NAME_MATCH");
  });
  it("rejects expired, stale and terminal advancement", () => {
    for (const state of ["REJECTED", "SUPPRESSED", "DUPLICATE", "APPROVED"] as const) {
      expect(() => assertReviewTransition(state, "APPROVE", false)).toThrow();
    }
    expect(() => assertReviewTransition("PENDING_REVIEW", "APPROVE", true)).toThrow();
    expect(() => assertReviewTransition("APPROVED", "SUPPRESS", false)).not.toThrow();
  });
});
