import type {Message} from "@/features/inquiries/domain/entities/message";

export type StaffTranslationNotificationState =
  | Readonly<{status: "PENDING"}>
  | Readonly<{status: "RUNNING"}>
  | Readonly<{status: "SUCCEEDED"; body: string}>
  | Readonly<{status: "FALLBACK"; reason: "FAILED" | "CANCELLED" | "NOT_REQUIRED" | "TIMED_OUT"}>;

export type RenderableStaffTranslationNotificationState = Extract<StaffTranslationNotificationState, {status: "SUCCEEDED" | "FALLBACK"}>;

export type CustomerMessageNotification = Readonly<{
  message: Message;
  staffTranslation: StaffTranslationNotificationState;
}>;
