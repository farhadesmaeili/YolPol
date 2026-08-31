import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";

const timeZonePattern = /^(?:[A-Za-z][A-Za-z0-9_+-]*)(?:\/[A-Za-z][A-Za-z0-9_+.-]*)*$/u;

export function parseBusinessTimeZone(value: unknown): string {
  if (typeof value !== "string") throw new AiOperationsPolicyValidationError("businessTimeZone", "Business time zone must be a string.");
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 64 || !timeZonePattern.test(trimmed)) {
    throw new AiOperationsPolicyValidationError("businessTimeZone", "Business time zone must be a valid IANA identifier.");
  }
  try {
    return new Intl.DateTimeFormat("en-US", {timeZone: trimmed}).resolvedOptions().timeZone;
  } catch {
    throw new AiOperationsPolicyValidationError("businessTimeZone", "Business time zone must be a valid IANA identifier.");
  }
}
