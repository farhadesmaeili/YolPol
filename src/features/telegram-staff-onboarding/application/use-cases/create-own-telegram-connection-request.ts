import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {TelegramConnectionTokenService, TelegramStaffOnboardingClock, TelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";
import {mayUseOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/telegram-authorization";
import {TelegramConnectionRequest} from "@/features/telegram-staff-onboarding/domain/entities/telegram-connection-request";

export const telegramConnectionRequestLifetimeMs = 10 * 60 * 1_000;

export type CreateOwnTelegramConnectionRequestResult =
  | Readonly<{status: "created"; connectionToken: string; expiresAt: string}>
  | Readonly<{status: "unavailable"}>;

export class CreateOwnTelegramConnectionRequest {
  constructor(
    private readonly repository: TelegramStaffOnboardingRepository,
    private readonly tokens: TelegramConnectionTokenService,
    private readonly authorization: StaffAuthorization,
    private readonly clock: TelegramStaffOnboardingClock,
  ) {}

  async execute(input: Readonly<{principal: StaffPrincipal}>): Promise<CreateOwnTelegramConnectionRequestResult> {
    if (!this.authorization.mayAccessStaffPanel(input.principal)) return {status: "unavailable"};
    try {
      const issued = this.tokens.issue();
      const createdAt = this.clock.now();
      const request = TelegramConnectionRequest.create({
        id: issued.requestId,
        staffAccountId: input.principal.staffAccountId,
        teamMemberId: input.principal.teamMemberId,
        tokenLookup: issued.lookup,
        tokenVerification: issued.verification,
        createdAt,
        expiresAt: new Date(createdAt.getTime() + telegramConnectionRequestLifetimeMs),
      });
      const result = await this.repository.createConnectionRequest({
        request,
        authorize: (identity) => mayUseOwnTelegram(this.authorization, identity),
      });
      if (result !== "created") return {status: "unavailable"};
      return Object.freeze({status: "created", connectionToken: issued.credential, expiresAt: request.expiresAt.toISOString()});
    } catch { return {status: "unavailable"}; }
  }
}
