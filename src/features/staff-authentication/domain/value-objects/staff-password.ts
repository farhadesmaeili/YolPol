import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

export const minimumStaffPasswordLength = 14;
export const maximumStaffPasswordLength = 1_024;

export class StaffPassword {
  private constructor(readonly value: string) {}

  static create(value: unknown): StaffPassword {
    if (typeof value !== "string" || value.length < minimumStaffPasswordLength || value.length > maximumStaffPasswordLength) {
      throw new StaffAuthenticationValidationError("Staff password does not meet the length policy.");
    }
    return new StaffPassword(value);
  }
}
