import type {AcceptedInquiryDto} from "@/features/inquiries/application/dto/inquiry-dto";
import type {NotificationChannel} from "@/features/inquiries/application/ports/inquiry-ports";

export type SubmitInquiryResult =
  | Readonly<{status: "accepted"; inquiry: AcceptedInquiryDto}>
  | Readonly<{status: "accepted_with_notification_failures"; inquiry: AcceptedInquiryDto; failedChannels: readonly NotificationChannel[]}>
  | Readonly<{status: "validation_failed"; field: string}>
  | Readonly<{status: "product_not_found"; productId: string}>
  | Readonly<{status: "product_unavailable"; productId: string}>
  | Readonly<{status: "locale_not_available"; productId: string}>
  | Readonly<{status: "duplicate_inquiry"}>
  | Readonly<{status: "persistence_failed"}>
  | Readonly<{status: "dependency_failed"; dependency: "catalog" | "clock" | "id_generator"}>;
