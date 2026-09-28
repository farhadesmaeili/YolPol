import {trackGenerateLead} from "@/shared/presentation/analytics/google-analytics-client";
import type {Locale} from "@/shared/types/locale";

type InquirySubmissionResult = Readonly<{status: string}>;
type GenerateLeadTracker = (input: Readonly<{locale: Locale; productCount: number}>) => boolean;

export function trackSuccessfulInquiryLead(
  result: InquirySubmissionResult,
  input: Readonly<{locale: Locale; productCount: number}>,
  tracker: GenerateLeadTracker = trackGenerateLead,
): boolean {
  return result.status === "created" ? tracker(input) : false;
}
