import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;

export class StaffAccountReference {
  private constructor(readonly value: string) {}

  static create(value: unknown): StaffAccountReference {
    if (typeof value !== "string" || !referencePattern.test(value)) {
      throw new StaffAuthenticationValidationError("Staff account reference is invalid.");
    }
    return new StaffAccountReference(value);
  }
}
