import {StaffAuthenticationValidationError} from "@/features/staff-authentication/domain/errors/staff-authentication-errors";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type StaffSessionInput = Readonly<{
  id: string;
  staffAccountId: string;
  tokenLookup: string;
  tokenVerification: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}>;

export class StaffSession {
  private constructor(
    readonly id: string,
    readonly staffAccountId: string,
    readonly tokenLookup: string,
    readonly tokenVerification: string,
    private readonly _createdAt: Date,
    private readonly _expiresAt: Date,
    private readonly _revokedAt?: Date,
  ) {}

  static reconstitute(input: StaffSessionInput): StaffSession {
    if (!referencePattern.test(input.id) || !referencePattern.test(input.staffAccountId)) {
      throw new StaffAuthenticationValidationError("Staff session reference is invalid.");
    }
    if (!digestPattern.test(input.tokenLookup) || !digestPattern.test(input.tokenVerification)) {
      throw new StaffAuthenticationValidationError("Staff session digest is invalid.");
    }
    if (!validDate(input.createdAt) || !validDate(input.expiresAt) || input.expiresAt <= input.createdAt) {
      throw new StaffAuthenticationValidationError("Staff session timestamps are invalid.");
    }
    if (input.revokedAt !== undefined && (!validDate(input.revokedAt) || input.revokedAt < input.createdAt)) {
      throw new StaffAuthenticationValidationError("Staff session revocation timestamp is invalid.");
    }
    return new StaffSession(
      input.id,
      input.staffAccountId,
      input.tokenLookup,
      input.tokenVerification,
      new Date(input.createdAt),
      new Date(input.expiresAt),
      input.revokedAt ? new Date(input.revokedAt) : undefined,
    );
  }

  get createdAt(): Date { return new Date(this._createdAt); }
  get expiresAt(): Date { return new Date(this._expiresAt); }
  get revokedAt(): Date | undefined { return this._revokedAt ? new Date(this._revokedAt) : undefined; }
  isExpired(at: Date): boolean { return at >= this._expiresAt; }
  isRevoked(): boolean { return this._revokedAt !== undefined; }
}

