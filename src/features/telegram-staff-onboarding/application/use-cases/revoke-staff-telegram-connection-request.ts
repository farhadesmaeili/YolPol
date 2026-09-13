import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayManageTargetTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";

export class RevokeStaffTelegramConnectionRequest {
  constructor(private readonly repository: TelegramStaffOnboardingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{principal: StaffPrincipal; targetStaffAccountId: string}>): Promise<Readonly<{status: "revoked" | "unavailable"}>> {
    try {
      const status = await this.repository.revokeStaffRequest({
        actorStaffAccountId: input.principal.staffAccountId,
        targetStaffAccountId: input.targetStaffAccountId,
        authorize: (actor, target) => mayManageTargetTelegram(this.authorization, actor, target),
      });
      return {status};
    } catch { return {status: "unavailable"}; }
  }
}
