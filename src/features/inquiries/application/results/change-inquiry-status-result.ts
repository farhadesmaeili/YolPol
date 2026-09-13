import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";

export type ChangeInquiryStatusResult =
  | Readonly<{status: "changed"; inquiryStatus: InquiryStatus}>
  | Readonly<{status: "unchanged"; inquiryStatus: InquiryStatus}>
  | Readonly<{status: "inquiry_not_found" | "invalid_transition" | "validation_failed" | "conflict" | "persistence_failed"}>;
