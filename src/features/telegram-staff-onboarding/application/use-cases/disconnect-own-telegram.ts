import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayUseOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";

export class DisconnectOwnTelegram {
  constructor(private readonly repository: TelegramStaffOnboardingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{principal: StaffPrincipal}>): Promise<Readonly<{status: "disconnected" | "unavailable"}>> {
    if (!this.authorization.mayAccessStaffPanel(input.principal)) return {status: "unavailable"};
    try {
      const status = await this.repository.disconnectOwn({
        staffAccountId: input.principal.staffAccountId,
        teamMemberId: input.principal.teamMemberId,
        authorize: (identity) => mayUseOwnTelegram(this.authorization, identity),
      });
      return {status};
    } catch { return {status: "unavailable"}; }
  }
}
