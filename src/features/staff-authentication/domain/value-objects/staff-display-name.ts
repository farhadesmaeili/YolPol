import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

export class StaffDisplayName {
  private constructor(readonly value: string) {}

  static create(value: unknown): StaffDisplayName {
    if (typeof value !== "string") throw new StaffAuthenticationValidationError("Staff display name is invalid.");
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 120 || /[\u0000-\u001F\u007F]/u.test(normalized)) {
      throw new StaffAuthenticationValidationError("Staff display name is invalid.");
    }
    return new StaffDisplayName(normalized);
  }
}
