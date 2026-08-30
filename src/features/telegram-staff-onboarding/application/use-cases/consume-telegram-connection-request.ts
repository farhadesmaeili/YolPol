import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramConnectionTokenService, TelegramStaffOnboardingIdGenerator, TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayUseOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";
import {TelegramPrivateChatId, TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

export class ConsumeTelegramConnectionRequest {
  constructor(
    private readonly repository: TelegramStaffOnboardingRepository,
    private readonly tokens: TelegramConnectionTokenService,
    private readonly ids: TelegramStaffOnboardingIdGenerator,
    private readonly authorization: StaffAuthorization,
  ) {}

  async execute(input: Readonly<{connectionToken: unknown; telegramUserId: unknown; privateChatId: unknown}>): Promise<Readonly<{status: "connected" | "unavailable"}>> {
    try {
      if (typeof input.connectionToken !== "string") return {status: "unavailable"};
      const presented = this.tokens.inspect(input.connectionToken);
      if (!presented) return {status: "unavailable"};
      const telegramUserId = TelegramUserId.create(input.telegramUserId);
      const privateChatId = TelegramPrivateChatId.create(input.privateChatId);
      const result = await this.repository.consumeConnectionRequest({
        linkId: this.ids.linkId(),
        lookup: presented.lookup,
        presentedVerification: presented.verification,
        telegramUserId,
        privateChatId,
        digestsMatch: (actual, expected) => this.tokens.digestsMatch(actual, expected),
        authorizeOwner: (identity) => mayUseOwnTelegram(this.authorization, identity),
      });
      return {status: result};
    } catch { return {status: "unavailable"}; }
  }
}
