import {DiscoveryError, type DiscoveryCandidateInput, type DiscoveryFinding, type DiscoveryState, type ReviewDecision} from "@/features/customer-acquisition/domain/types/discovery-types";
import {companyNameKey} from "@/features/customer-acquisition/domain/value-objects/acquisition-values";

export function identityFinding(a: DiscoveryCandidateInput, b: DiscoveryCandidateInput, sourceA: string, sourceB: string): DiscoveryFinding | null {
  const strong = a.domain === b.domain || (sourceA === sourceB && a.recordId === b.recordId);
  if (strong) return a.name === b.name && a.country === b.country && a.domain === b.domain ? "EXACT_DUPLICATE" : "STRONG_CONFLICT";
  // Conservative whitespace-normalized name equality; never a merge instruction.
  return companyNameKey(a.name).replace(/\s+/gu, " ") === companyNameKey(b.name).replace(/\s+/gu, " ") && a.country === b.country ? "POSSIBLE_NAME_MATCH" : null;
}

export function assertReviewTransition(state: DiscoveryState, decision: ReviewDecision, expired: boolean): void {
  if (expired) throw new DiscoveryError("EXPIRED");
  if (["REJECTED", "SUPPRESSED", "DUPLICATE"].includes(state) || (state === "APPROVED" && decision !== "SUPPRESS")) throw new DiscoveryError("CONFLICT");
}
