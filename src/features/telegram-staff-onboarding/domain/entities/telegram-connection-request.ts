import {TelegramStaffOnboardingValidationError} from "@/features/telegram-staff-onboarding/domain/errors/telegram-staff-onboarding-errors";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type TelegramConnectionRequestInput = Readonly<{
  id: string;
  staffAccountId: string;
  teamMemberId: string;
  tokenLookup: string;
  tokenVerification: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt?: Date;
  revokedAt?: Date;
}>;

export class TelegramConnectionRequest {
  private constructor(
    readonly id: string,
    readonly staffAccountId: string,
    readonly teamMemberId: string,
    readonly tokenLookup: string,
    readonly tokenVerification: string,
    private readonly _createdAt: Date,
    private readonly _expiresAt: Date,
    private readonly _consumedAt?: Date,
    private readonly _revokedAt?: Date,
  ) {}

  static create(input: Omit<TelegramConnectionRequestInput, "consumedAt" | "revokedAt">): TelegramConnectionRequest {
    return TelegramConnectionRequest.reconstitute(input);
  }

  static reconstitute(input: TelegramConnectionRequestInput): TelegramConnectionRequest {
    if (![input.id, input.staffAccountId, input.teamMemberId].every((value) => referencePattern.test(value))) {
      throw new TelegramStaffOnboardingValidationError("Telegram connection request reference is invalid.");
    }
    if (!digestPattern.test(input.tokenLookup) || !digestPattern.test(input.tokenVerification) || input.tokenLookup === input.tokenVerification) {
      throw new TelegramStaffOnboardingValidationError("Telegram connection request digest is invalid.");
    }
    if (!validDate(input.createdAt) || !validDate(input.expiresAt) || input.expiresAt <= input.createdAt) {
      throw new TelegramStaffOnboardingValidationError("Telegram connection request expiry is invalid.");
    }
    for (const terminalAt of [input.consumedAt, input.revokedAt]) {
      if (terminalAt !== undefined && (!validDate(terminalAt) || terminalAt < input.createdAt)) {
        throw new TelegramStaffOnboardingValidationError("Telegram connection request terminal timestamp is invalid.");
      }
    }
    if (input.consumedAt && input.revokedAt) {
      throw new TelegramStaffOnboardingValidationError("Telegram connection request cannot have multiple terminal states.");
    }
    return new TelegramConnectionRequest(
      input.id,
      input.staffAccountId,
      input.teamMemberId,
      input.tokenLookup,
      input.tokenVerification,
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
  isAvailable(at: Date): boolean { return validDate(at) && !this._consumedAt && !this._revokedAt && at < this._expiresAt; }
}
