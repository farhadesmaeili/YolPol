import {TelegramStaffOnboardingValidationError} from "@/features/telegram-staff-onboarding/domain/errors/telegram-staff-onboarding-errors";
import {TelegramPrivateChatId, TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

const referencePattern = /^[A-Za-z0-9_-]{1,128}$/u;

function validDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

export type TelegramStaffLinkInput = Readonly<{
  id: string;
  teamMemberId: string;
  telegramUserId: string;
  privateChatId: string;
  firstLinkedAt: Date;
  connectedAt: Date;
  disconnectedAt?: Date;
  updatedAt: Date;
}>;

export class TelegramStaffLink {
  private constructor(
    readonly id: string,
    readonly teamMemberId: string,
    readonly telegramUserId: TelegramUserId,
    readonly privateChatId: TelegramPrivateChatId,
    private readonly _firstLinkedAt: Date,
    private readonly _connectedAt: Date,
    private readonly _disconnectedAt: Date | undefined,
    private readonly _updatedAt: Date,
  ) {}

  static create(input: Omit<TelegramStaffLinkInput, "disconnectedAt">): TelegramStaffLink {
    return TelegramStaffLink.reconstitute(input);
  }

  static reconstitute(input: TelegramStaffLinkInput): TelegramStaffLink {
    if (!referencePattern.test(input.id) || !referencePattern.test(input.teamMemberId)) {
      throw new TelegramStaffOnboardingValidationError("Telegram link reference is invalid.");
    }
    if (![input.firstLinkedAt, input.connectedAt, input.updatedAt].every(validDate)) {
      throw new TelegramStaffOnboardingValidationError("Telegram link timestamp is invalid.");
    }
    if (input.firstLinkedAt > input.connectedAt || input.connectedAt > input.updatedAt) {
      throw new TelegramStaffOnboardingValidationError("Telegram link timestamps are out of order.");
    }
    if (input.disconnectedAt !== undefined && (!validDate(input.disconnectedAt) || input.disconnectedAt < input.connectedAt || input.disconnectedAt > input.updatedAt)) {
      throw new TelegramStaffOnboardingValidationError("Telegram disconnect timestamp is invalid.");
    }
    return new TelegramStaffLink(
      input.id,
      input.teamMemberId,
      TelegramUserId.create(input.telegramUserId),
      TelegramPrivateChatId.create(input.privateChatId),
      new Date(input.firstLinkedAt),
      new Date(input.connectedAt),
      input.disconnectedAt ? new Date(input.disconnectedAt) : undefined,
      new Date(input.updatedAt),
    );
  }

  get firstLinkedAt(): Date { return new Date(this._firstLinkedAt); }
  get connectedAt(): Date { return new Date(this._connectedAt); }
  get disconnectedAt(): Date | undefined { return this._disconnectedAt ? new Date(this._disconnectedAt) : undefined; }
  get updatedAt(): Date { return new Date(this._updatedAt); }
  get connected(): boolean { return this._disconnectedAt === undefined; }

  disconnect(at: Date): TelegramStaffLink {
    if (!this.connected || !validDate(at) || at < this._connectedAt) {
      throw new TelegramStaffOnboardingValidationError("Telegram link cannot be disconnected at this time.");
    }
    return TelegramStaffLink.reconstitute({...this.toInput(), disconnectedAt: at, updatedAt: at});
  }

  reconnect(privateChatId: string, at: Date): TelegramStaffLink {
    if (this.connected || !validDate(at) || at < this._updatedAt) {
      throw new TelegramStaffOnboardingValidationError("Telegram link cannot be reconnected at this time.");
    }
    return TelegramStaffLink.reconstitute({...this.toInput(), privateChatId, connectedAt: at, disconnectedAt: undefined, updatedAt: at});
  }

  private toInput(): TelegramStaffLinkInput {
    return {
      id: this.id,
      teamMemberId: this.teamMemberId,
      telegramUserId: this.telegramUserId.value,
      privateChatId: this.privateChatId.value,
      firstLinkedAt: this.firstLinkedAt,
      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt,
      updatedAt: this.updatedAt,
    };
  }
}
