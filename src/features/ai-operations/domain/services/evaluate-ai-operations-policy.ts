import type {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import type {AiOperationsDecision, AiOperationsWeekday} from "@/features/ai-operations/domain/types/ai-operations-types";

const weekdayByShortName: Readonly<Record<string, AiOperationsWeekday>> = Object.freeze({
  Mon: "MONDAY", Tue: "TUESDAY", Wed: "WEDNESDAY", Thu: "THURSDAY", Fri: "FRIDAY", Sat: "SATURDAY", Sun: "SUNDAY",
});

function localWeekdayAndMinute(instant: Date, timeZone: string): Readonly<{weekday: AiOperationsWeekday; minute: number}> {
  if (!(instant instanceof Date) || !Number.isFinite(instant.getTime())) throw new Error("Evaluation instant is invalid.");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const weekday = weekdayByShortName[parts.find((part) => part.type === "weekday")?.value ?? ""];
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!weekday || !Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    throw new Error("Time zone evaluation failed.");
  }
  return {weekday, minute: hour * 60 + minute};
}

export function evaluateAiOperationsPolicy(policy: AiOperationsPolicy, instant: Date): AiOperationsDecision {
  if (policy.mode === "DISABLED") return {allowed: false, reason: "POLICY_DISABLED"};
  if (policy.mode === "FALLBACK") return {allowed: true, reason: "ALLOWED_FALLBACK"};
  const local = localWeekdayAndMinute(instant, policy.businessTimeZone);
  const allowed = policy.scheduleWindows.some((window) => window.enabled
    && window.weekday === local.weekday
    && window.startMinute <= local.minute
    && local.minute < window.endMinute);
  return allowed ? {allowed: true, reason: "ALLOWED_SCHEDULE"} : {allowed: false, reason: "OUTSIDE_SCHEDULE"};
}
