import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/u;

export class StaffEmail {
  private constructor(readonly value: string) {}

  static create(value: unknown): StaffEmail {
    if (typeof value !== "string") throw new StaffAuthenticationValidationError("Staff email is invalid.");
    const normalized = value.trim().toLowerCase();
    const [localPart] = normalized.split("@", 1);
    if (normalized.length > 254 || !localPart || localPart.length > 64 || !emailPattern.test(normalized)) {
      throw new StaffAuthenticationValidationError("Staff email is invalid.");
    }
    return new StaffEmail(normalized);
  }
}
