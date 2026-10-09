import type {QualificationInput} from "@/features/customer-acquisition/domain/types/acquisition-types";

export function scoreFoundation(facts: QualificationInput["facts"], suppressed: boolean) {
  const reasons = [
    ...(facts.marketMatch ? ["MARKET_MATCH"] : []),
    ...(facts.segmentMatch ? ["SEGMENT_MATCH"] : []),
    ...(facts.packagingRelevance ? ["PACKAGING_RELEVANCE"] : []),
  ];
  const score = (facts.marketMatch ? 30 : 0) + (facts.segmentMatch ? 40 : 0) + (facts.packagingRelevance ? 30 : 0);
  return Object.freeze({score, decision: suppressed ? "BLOCKED" as const : score >= 70 ? "FOUNDATION_FIT" as const : "REVIEW_REQUIRED" as const,
    reasons: suppressed ? [...reasons, "SUPPRESSION_PRESENT"] : reasons.length ? reasons : ["INSUFFICIENT_EVIDENCE"]});
}
