export const aiOperationsModes = ["DISABLED", "FALLBACK", "SCHEDULED"] as const;
export type AiOperationsMode = (typeof aiOperationsModes)[number];

export const aiOperationsWeekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type AiOperationsWeekday = (typeof aiOperationsWeekdays)[number];

export type AiScheduleWindow = Readonly<{
  weekday: AiOperationsWeekday;
  startMinute: number;
  endMinute: number;
  enabled: boolean;
}>;

export type AiScheduleWindowInput = Readonly<{
  weekday: unknown;
  startMinute: unknown;
  endMinute: unknown;
  enabled: unknown;
}>;

export const aiOperationsDecisionReasons = [
  "POLICY_DISABLED",
  "OUTSIDE_SCHEDULE",
  "EMERGENCY_DISABLED",
  "POLICY_UNAVAILABLE",
  "POLICY_INVALID",
  "ALLOWED_FALLBACK",
  "ALLOWED_SCHEDULE",
] as const;
export type AiOperationsDecisionReason = (typeof aiOperationsDecisionReasons)[number];

export type AiOperationsDecision = Readonly<{
  allowed: boolean;
  reason: AiOperationsDecisionReason;
}>;
