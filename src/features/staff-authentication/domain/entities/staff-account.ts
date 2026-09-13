import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";
import {parseStaffRole, type StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type StaffAccountInput = Readonly<{
  id: string;
  teamMemberId: string;
  normalizedEmail: string;
  passwordHash: string;
  role: unknown;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}>;

export class StaffAccount {
  private constructor(
    readonly id: string,
    readonly teamMemberId: string,
    readonly normalizedEmail: string,
    readonly passwordHash: string,
    readonly role: StaffRole,
    readonly active: boolean,
    private readonly _createdAt: Date,
    private readonly _updatedAt: Date,
  ) {}

  static create(input: Readonly<{
    id: string;
    teamMemberId: string;
    normalizedEmail: string;
    passwordHash: string;
    role: unknown;
    createdAt: Date;
  }>): StaffAccount {
    return StaffAccount.reconstitute({...input, active: true, updatedAt: input.createdAt});
  }

  static reconstitute(input: StaffAccountInput): StaffAccount {
    const id = StaffAccountReference.create(input.id);
    const teamMemberId = StaffAccountReference.create(input.teamMemberId);
    const email = StaffEmail.create(input.normalizedEmail);
    if (email.value !== input.normalizedEmail) throw new StaffAuthenticationValidationError("Staff account email is not normalized.");
    if (typeof input.passwordHash !== "string" || input.passwordHash.length < 1 || input.passwordHash.length > 512 || /[\u0000-\u001F\u007F]/u.test(input.passwordHash)) {
      throw new StaffAuthenticationValidationError("Staff password hash is invalid.");
    }
    if (typeof input.active !== "boolean") throw new StaffAuthenticationValidationError("Staff account state is invalid.");
    if (!validDate(input.createdAt) || !validDate(input.updatedAt) || input.updatedAt < input.createdAt) {
      throw new StaffAuthenticationValidationError("Staff account timestamps are invalid.");
    }
    return new StaffAccount(
      id.value,
      teamMemberId.value,
      email.value,
      input.passwordHash,
      parseStaffRole(input.role),
      input.active,
      new Date(input.createdAt),
      new Date(input.updatedAt),
    );
  }

  get createdAt(): Date { return new Date(this._createdAt); }
  get updatedAt(): Date { return new Date(this._updatedAt); }
}
