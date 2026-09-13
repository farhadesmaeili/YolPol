import type {StoredInquiryWorkflowEvent} from "@/features/inquiries/domain/events/inquiry-workflow-event";

export type ReadInquiryWorkflowHistoryResult =
  | Readonly<{status: "found"; events: readonly StoredInquiryWorkflowEvent[]}>
  | Readonly<{status: "inquiry_not_found" | "validation_failed" | "persistence_failed"}>;
