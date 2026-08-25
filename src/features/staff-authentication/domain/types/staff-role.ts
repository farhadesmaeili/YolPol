import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

export const staffRoles = ["ADMIN", "SALES"] as const;
export type StaffRole = (typeof staffRoles)[number];

export function parseStaffRole(value: unknown): StaffRole {
  if (typeof value !== "string" || !(staffRoles as readonly string[]).includes(value)) {
    throw new StaffAuthenticationValidationError("Unsupported staff role.");
  }
  return value as StaffRole;
}

