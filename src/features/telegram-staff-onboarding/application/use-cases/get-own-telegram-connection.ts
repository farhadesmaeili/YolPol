import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramConnectionStateDto} from "@/features/telegram-staff-onboarding/application/dto/telegram-connection-dto";
import type {TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayUseOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";

export class GetOwnTelegramConnection {
  constructor(private readonly repository: TelegramStaffOnboardingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{principal: StaffPrincipal}>): Promise<TelegramConnectionStateDto | Readonly<{status: "unavailable"}>> {
    if (!this.authorization.mayAccessStaffPanel(input.principal)) return {status: "unavailable"};
    try {
      const record = await this.repository.getOwnConnection({
        staffAccountId: input.principal.staffAccountId,
        teamMemberId: input.principal.teamMemberId,
        authorize: (identity) => mayUseOwnTelegram(this.authorization, identity),
      });
      if (!record) return {status: "unavailable"};
      if (record.connected) return {status: "connected"};
      if (record.pendingExpiresAt) return {status: "pending", expiresAt: record.pendingExpiresAt.toISOString()};
      return {status: "not_connected"};
    } catch { return {status: "unavailable"}; }
  }
}
