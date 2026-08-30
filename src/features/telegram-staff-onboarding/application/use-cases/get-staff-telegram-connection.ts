import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramConnectionStateDto} from "@/features/telegram-staff-onboarding/application/dto/telegram-connection-dto";
import type {TelegramOwnConnectionRecord, TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayManageTargetTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";

function safeState(record: TelegramOwnConnectionRecord): TelegramConnectionStateDto {
  if (record.connected) return {status: "connected"};
  if (record.pendingExpiresAt) return {status: "pending", expiresAt: record.pendingExpiresAt.toISOString()};
  return {status: "not_connected"};
}

export class GetStaffTelegramConnection {
  constructor(private readonly repository: TelegramStaffOnboardingRepository, private readonly authorization: StaffAuthorization) {}

  async execute(input: Readonly<{principal: StaffPrincipal; targetStaffAccountId: string}>): Promise<TelegramConnectionStateDto | Readonly<{status: "unavailable"}>> {
    try {
      const record = await this.repository.getStaffConnection({
        actorStaffAccountId: input.principal.staffAccountId,
        targetStaffAccountId: input.targetStaffAccountId,
        authorize: (actor, target) => mayManageTargetTelegram(this.authorization, actor, target),
      });
      return record ? safeState(record) : {status: "unavailable"};
    } catch { return {status: "unavailable"}; }
  }
}
