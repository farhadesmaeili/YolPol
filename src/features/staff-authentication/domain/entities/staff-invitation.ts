import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";
import {parseStaffRole, type StaffRole} from "@/features/staff-authentication/domain/types/staff-role";
import {StaffAccountReference} from "@/features/staff-authentication/domain/value-objects/staff-account-reference";
import {StaffDisplayName} from "@/features/staff-authentication/domain/value-objects/staff-display-name";
import {StaffEmail} from "@/features/staff-authentication/domain/value-objects/staff-email";

const digestPattern = /^[a-f0-9]{64}$/u;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type StaffInvitationInput = Readonly<{
  id: string;
  normalizedEmail: string;
  displayName: string;
  targetRole: unknown;
  tokenLookup: string;
  tokenVerification: string;
  createdByStaffAccountId: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  revokedAt?: Date;
}>;

export class StaffInvitation {
  private constructor(
    readonly id: string,
    readonly normalizedEmail: string,
    readonly displayName: string,
    readonly targetRole: Exclude<StaffRole, "SUPER_ADMIN">,
    readonly tokenLookup: string,
    readonly tokenVerification: string,
    readonly createdByStaffAccountId: string,
    private readonly _createdAt: Date,
    private readonly _expiresAt: Date,
    private readonly _consumedAt?: Date,
    private readonly _revokedAt?: Date,
  ) {}

  static create(input: Omit<StaffInvitationInput, "consumedAt" | "revokedAt">): StaffInvitation {
    return StaffInvitation.reconstitute(input);
  }

  static reconstitute(input: StaffInvitationInput): StaffInvitation {
    const role = parseStaffRole(input.targetRole);
    if (role === "SUPER_ADMIN") throw new StaffAuthenticationValidationError("Super Admin invitations are not allowed.");
    const email = StaffEmail.create(input.normalizedEmail);
    const displayName = StaffDisplayName.create(input.displayName);
    if (email.value !== input.normalizedEmail || displayName.value !== input.displayName) {
      throw new StaffAuthenticationValidationError("Staff invitation identity is not normalized.");
    }
    if (!digestPattern.test(input.tokenLookup) || !digestPattern.test(input.tokenVerification)) {
      throw new StaffAuthenticationValidationError("Staff invitation digest is invalid.");
    }
    if (!validDate(input.createdAt) || !validDate(input.expiresAt) || input.expiresAt <= input.createdAt) {
      throw new StaffAuthenticationValidationError("Staff invitation timestamps are invalid.");
    }
    for (const value of [input.consumedAt, input.revokedAt]) {
      if (value !== undefined && (!validDate(value) || value < input.createdAt)) {
        throw new StaffAuthenticationValidationError("Staff invitation lifecycle timestamp is invalid.");
      }
    }
    if (input.consumedAt && input.revokedAt) {
      throw new StaffAuthenticationValidationError("Staff invitation cannot have multiple terminal states.");
    }
    return new StaffInvitation(
      StaffAccountReference.create(input.id).value,
      email.value,
      displayName.value,
      role,
      input.tokenLookup,
      input.tokenVerification,
      StaffAccountReference.create(input.createdByStaffAccountId).value,
      new Date(input.createdAt),
      new Date(input.expiresAt),
      input.consumedAt ? new Date(input.consumedAt) : undefined,
      input.revokedAt ? new Date(input.revokedAt) : undefined,
    );
  }

  get createdAt(): Date { return new Date(this._createdAt); }
  get expiresAt(): Date { return new Date(this._expiresAt); }
  get consumedAt(): Date | undefined { return this._consumedAt ? new Date(this._consumedAt) : undefined; }
  get revokedAt(): Date | undefined { return this._revokedAt ? new Date(this._revokedAt) : undefined; }
  isAvailable(at: Date): boolean { return !this._consumedAt && !this._revokedAt && at < this._expiresAt; }
}
