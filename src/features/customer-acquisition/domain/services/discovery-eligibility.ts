import type {DiscoveryState} from "@/features/customer-acquisition/domain/types/discovery-types";

export type DiscoveryEligibility = Readonly<{
  contract: "authorization-time-v1";
  evaluatedAt: string;
  status: "EXPIRED" | "POLICY_DENIED" | "SUPPRESSED" | "TERMINAL" | "IDENTITY_CONFLICT" | "EVIDENCE_REQUIRED" | "READY_FOR_APPROVAL" | "CURRENTLY_APPROVED";
}>;
export type DiscoveryEligibilityFacts = Readonly<{
  state: DiscoveryState; evaluatedAt: string; expired: boolean;
  policyAllowed: boolean; suppressed: boolean; identityConflict: boolean; evidenceSatisfied: boolean;
}>;

// Contract shared with acquisition_discovery_status, enforced inside PostgreSQL.
// Facts/time must come from protected storage, never a caller or cached receipt.
// This is an observation, not a transferable authorization for a subsequent action.
export function discoveryEligibility(facts: DiscoveryEligibilityFacts): DiscoveryEligibility {
  // Keep the database's microsecond comparison; JavaScript Date would round it.
  const status: DiscoveryEligibility["status"] = facts.expired ? "EXPIRED"
    : !facts.policyAllowed ? "POLICY_DENIED"
    : facts.suppressed || facts.state === "SUPPRESSED" ? "SUPPRESSED"
    : facts.state === "REJECTED" || facts.state === "DUPLICATE" ? "TERMINAL"
    : facts.identityConflict ? "IDENTITY_CONFLICT"
    : !facts.evidenceSatisfied ? "EVIDENCE_REQUIRED"
    : facts.state === "APPROVED" ? "CURRENTLY_APPROVED" : "READY_FOR_APPROVAL";
  return {contract: "authorization-time-v1", evaluatedAt: facts.evaluatedAt, status};
}
