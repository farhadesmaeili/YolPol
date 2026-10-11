import {describe, expect, it} from "vitest";
import {discoveryEligibility} from "@/features/customer-acquisition/domain/services/discovery-eligibility";
import type {DiscoveryState} from "@/features/customer-acquisition/domain/types/discovery-types";

const facts = {state: "APPROVED" as DiscoveryState, evaluatedAt: "2026-10-10T00:00:00.000Z", expiresAt: "2026-10-11T00:00:00.000Z",
  expired: false, policyAllowed: true, suppressed: false, identityConflict: false, evidenceSatisfied: true};
describe("authorization-time eligibility contract", () => {
  it.each([
    [{}, "CURRENTLY_APPROVED"],
    [{expiresAt: facts.evaluatedAt, expired: true}, "EXPIRED"],
    [{policyAllowed: false}, "POLICY_DENIED"],
    [{suppressed: true}, "SUPPRESSED"],
    [{identityConflict: true}, "IDENTITY_CONFLICT"],
    [{evidenceSatisfied: false}, "EVIDENCE_REQUIRED"],
    [{state: "PENDING_REVIEW"}, "READY_FOR_APPROVAL"],
    [{state: "REJECTED"}, "TERMINAL"],
    [{state: "DUPLICATE"}, "TERMINAL"],
    [{state: "SUPPRESSED"}, "SUPPRESSED"],
  ] as const)("evaluates trusted current facts %j as %s", (patch, status) => {
    expect(discoveryEligibility({...facts, ...patch})).toEqual({contract: "authorization-time-v1", evaluatedAt: facts.evaluatedAt, status});
  });
  it("never treats a historical approval as a reusable authorization", () => {
    expect(discoveryEligibility(facts).status).toBe("CURRENTLY_APPROVED");
    expect(discoveryEligibility({...facts, evaluatedAt: facts.expiresAt, expired: true}).status).toBe("EXPIRED");
  });
  it("preserves PostgreSQL sub-millisecond expiry facts instead of resampling or rounding time", () => {
    const precise = {...facts, evaluatedAt: "2026-10-10T00:00:00.123001Z", expiresAt: "2026-10-10T00:00:00.123999Z", expired: false};
    expect(discoveryEligibility(precise).status).toBe("CURRENTLY_APPROVED");
  });
});
