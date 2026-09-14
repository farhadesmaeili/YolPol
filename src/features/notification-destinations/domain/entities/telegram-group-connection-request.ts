import {NotificationDestinationValidationError} from "@/features/notification-destinations/domain/errors/notification-destination-errors";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

export class TelegramGroupConnectionRequest {
  private constructor(
    readonly id: string,
    readonly staffAccountId: string,
    readonly teamMemberId: string,
    readonly tokenLookup: string,
    readonly tokenVerification: string,
    readonly createdAt: Date,
    readonly expiresAt: Date,
  ) {}

  static create(input: Readonly<{
    id: string;
    staffAccountId: string;
    teamMemberId: string;
    tokenLookup: string;
    tokenVerification: string;
    createdAt: Date;
    expiresAt: Date;
  }>): TelegramGroupConnectionRequest {
    if (![input.id, input.staffAccountId, input.teamMemberId].every((value) => referencePattern.test(value))) {
      throw new NotificationDestinationValidationError("Telegram group request reference is invalid.");
    }
    if (!digestPattern.test(input.tokenLookup) || !digestPattern.test(input.tokenVerification) || input.tokenLookup === input.tokenVerification) {
      throw new NotificationDestinationValidationError("Telegram group request digest is invalid.");
    }
    if (!(input.createdAt instanceof Date) || !(input.expiresAt instanceof Date)
      || !Number.isFinite(input.createdAt.getTime()) || !Number.isFinite(input.expiresAt.getTime())
      || input.expiresAt <= input.createdAt) {
      throw new NotificationDestinationValidationError("Telegram group request expiry is invalid.");
    }
    return new TelegramGroupConnectionRequest(
      input.id,
      input.staffAccountId,
      input.teamMemberId,
      input.tokenLookup,
      input.tokenVerification,
      new Date(input.createdAt),
      new Date(input.expiresAt),
    );
  }
}
