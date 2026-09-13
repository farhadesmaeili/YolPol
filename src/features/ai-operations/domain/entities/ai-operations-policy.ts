import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";
import {aiOperationsModes, type AiOperationsMode, type AiScheduleWindow, type AiScheduleWindowInput} from "@/features/ai-operations/domain/types/ai-operations-types";
import {normalizeAiScheduleWindows, restoreAiScheduleWindows} from "@/features/ai-operations/domain/value-objects/ai-schedule";
import {parseBusinessTimeZone} from "@/features/ai-operations/domain/value-objects/business-time-zone";

export const minimumHumanGracePeriodSeconds = 60;
export const maximumHumanGracePeriodSeconds = 86_400;

type PolicyInput = Readonly<{
  mode: unknown;
  businessTimeZone: unknown;
  humanGracePeriodSeconds: unknown;
  scheduleWindows: readonly AiScheduleWindowInput[];
  version: unknown;
  updatedAt: unknown;
  updatedBy: unknown;
}>;

const actorReferencePattern = /^staff:[A-Za-z0-9_-]{1,128}$/u;

function parseMode(value: unknown): AiOperationsMode {
  if (typeof value !== "string" || !(aiOperationsModes as readonly string[]).includes(value)) {
    throw new AiOperationsPolicyValidationError("mode", "AI operations mode is invalid.");
  }
  return value as AiOperationsMode;
}

function parseGracePeriod(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimumHumanGracePeriodSeconds || (value as number) > maximumHumanGracePeriodSeconds) {
    throw new AiOperationsPolicyValidationError("humanGracePeriodSeconds", `Human grace period must be from ${minimumHumanGracePeriodSeconds} to ${maximumHumanGracePeriodSeconds} seconds.`);
  }
  return value as number;
}

function parseVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 2_147_483_647) {
    throw new AiOperationsPolicyValidationError("version", "Policy version is invalid.");
  }
  return value as number;
}

function parseUpdatedAt(value: unknown): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new AiOperationsPolicyValidationError("updatedAt", "Policy update time is invalid.");
  return new Date(value);
}

function parseUpdatedBy(value: unknown): string {
  if (typeof value !== "string" || !actorReferencePattern.test(value)) {
    throw new AiOperationsPolicyValidationError("updatedBy", "Policy actor reference is invalid.");
  }
  return value;
}

export class AiOperationsPolicy {
  readonly mode: AiOperationsMode;
  readonly businessTimeZone: string;
  readonly humanGracePeriodSeconds: number;
  readonly scheduleWindows: readonly AiScheduleWindow[];
  readonly version: number;
  readonly updatedAt: Date;
  readonly updatedBy: string;

  private constructor(input: PolicyInput, restore: boolean) {
    this.mode = parseMode(input.mode);
    this.businessTimeZone = parseBusinessTimeZone(input.businessTimeZone);
    this.humanGracePeriodSeconds = parseGracePeriod(input.humanGracePeriodSeconds);
    this.scheduleWindows = restore ? restoreAiScheduleWindows(input.scheduleWindows) : normalizeAiScheduleWindows(input.scheduleWindows);
    this.version = parseVersion(input.version);
    this.updatedAt = parseUpdatedAt(input.updatedAt);
    this.updatedBy = parseUpdatedBy(input.updatedBy);
    if (this.mode === "SCHEDULED" && !this.scheduleWindows.some((window) => window.enabled)) {
      throw new AiOperationsPolicyValidationError("scheduleWindows", "Scheduled mode requires at least one enabled window.");
    }
    Object.freeze(this);
  }

  static create(input: PolicyInput): AiOperationsPolicy { return new AiOperationsPolicy(input, false); }
  static restore(input: PolicyInput): AiOperationsPolicy { return new AiOperationsPolicy(input, true); }
}
