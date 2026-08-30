import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramStaffActorDto} from "@/features/telegram-staff-onboarding/application/dto/telegram-connection-dto";
import {principalFromTelegramIdentity, type TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {TelegramUserId} from "@/features/telegram-staff-onboarding/domain/value-objects/telegram-identifiers";

export class ResolveTelegramStaffActor {
  constructor(private readonly repository: TelegramStaffOnboardingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{telegramUserId: unknown}>): Promise<Readonly<{status: "resolved"; actor: TelegramStaffActorDto}> | Readonly<{status: "unresolved"}>> {
    try {
      const identity = await this.repository.findActorByTelegramUserId(TelegramUserId.create(input.telegramUserId));
      if (!identity || !identity.accountActive || !identity.teamMemberActive) return {status: "unresolved"};
      const principal = principalFromTelegramIdentity(identity);
      if (!this.authorization.mayAccessStaffPanel(principal)) return {status: "unresolved"};
      return {status: "resolved", actor: Object.freeze({principal, capabilities: this.authorization.capabilitiesFor(principal)})};
    } catch { return {status: "unresolved"}; }
  }
}
