import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";
import {aiOperationsWeekdays, type AiOperationsWeekday, type AiScheduleWindow, type AiScheduleWindowInput} from "@/features/ai-operations/domain/types/ai-operations-types";

export const maximumAiScheduleWindows = 64;

const weekdayIndex = new Map<AiOperationsWeekday, number>(aiOperationsWeekdays.map((weekday, index) => [weekday, index]));

function parseWeekday(value: unknown): AiOperationsWeekday {
  if (typeof value !== "string" || !(aiOperationsWeekdays as readonly string[]).includes(value)) {
    throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule weekday is invalid.");
  }
  return value as AiOperationsWeekday;
}

function parseMinute(value: unknown, field: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new AiOperationsPolicyValidationError("scheduleWindows", `${field} must be a whole minute of day.`);
  }
  return value as number;
}

function compareWindows(left: AiScheduleWindow, right: AiScheduleWindow): number {
  return (weekdayIndex.get(left.weekday)! - weekdayIndex.get(right.weekday)!)
    || left.startMinute - right.startMinute
    || left.endMinute - right.endMinute
    || Number(right.enabled) - Number(left.enabled);
}

function validateNormalized(windows: readonly AiScheduleWindow[]): readonly AiScheduleWindow[] {
  if (windows.length > maximumAiScheduleWindows) {
    throw new AiOperationsPolicyValidationError("scheduleWindows", `At most ${maximumAiScheduleWindows} normalized schedule windows are allowed.`);
  }
  const ordered = [...windows].sort(compareWindows);
  for (let index = 0; index < ordered.length; index += 1) {
    const current = ordered[index]!;
    const previous = ordered[index - 1];
    if (current.startMinute >= current.endMinute) {
      throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule windows must have positive duration.");
    }
    if (previous?.weekday === current.weekday && previous.endMinute > current.startMinute) {
      throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule windows must not overlap.");
    }
    if (previous?.weekday === current.weekday && previous.startMinute === current.startMinute && previous.endMinute === current.endMinute) {
      throw new AiOperationsPolicyValidationError("scheduleWindows", "Duplicate schedule windows are not allowed.");
    }
  }
  return Object.freeze(ordered.map((window) => Object.freeze({...window})));
}

export function normalizeAiScheduleWindows(inputs: readonly AiScheduleWindowInput[]): readonly AiScheduleWindow[] {
  if (!Array.isArray(inputs) || inputs.length > maximumAiScheduleWindows) {
    throw new AiOperationsPolicyValidationError("scheduleWindows", `At most ${maximumAiScheduleWindows} schedule windows are allowed.`);
  }
  const normalized: AiScheduleWindow[] = [];
  for (const input of inputs) {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule window is invalid.");
    }
    const weekday = parseWeekday(input.weekday);
    const startMinute = parseMinute(input.startMinute, "Schedule start", 1_439);
    const endMinute = parseMinute(input.endMinute, "Schedule end", 1_439);
    if (typeof input.enabled !== "boolean") throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule enabled state is invalid.");
    if (startMinute === endMinute) throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule windows must have positive duration.");
    if (startMinute < endMinute) {
      normalized.push({weekday, startMinute, endMinute, enabled: input.enabled});
      continue;
    }
    normalized.push({weekday, startMinute, endMinute: 1_440, enabled: input.enabled});
    const nextWeekday = aiOperationsWeekdays[((weekdayIndex.get(weekday)! + 1) % aiOperationsWeekdays.length)]!;
    if (endMinute > 0) normalized.push({weekday: nextWeekday, startMinute: 0, endMinute, enabled: input.enabled});
  }
  return validateNormalized(normalized);
}

export function restoreAiScheduleWindows(inputs: readonly AiScheduleWindowInput[]): readonly AiScheduleWindow[] {
  if (!Array.isArray(inputs)) throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule windows are invalid.");
  const restored = inputs.map((input) => {
    const weekday = parseWeekday(input.weekday);
    const startMinute = parseMinute(input.startMinute, "Schedule start", 1_439);
    const endMinute = parseMinute(input.endMinute, "Schedule end", 1_440);
    if (typeof input.enabled !== "boolean") throw new AiOperationsPolicyValidationError("scheduleWindows", "Schedule enabled state is invalid.");
    return {weekday, startMinute, endMinute, enabled: input.enabled};
  });
  return validateNormalized(restored);
}
