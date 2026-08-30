import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {ConsumeTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/consume-telegram-connection-request";
import {CreateOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/create-own-telegram-connection-request";
import {DisconnectOwnTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/disconnect-own-telegram";
import {ForceDisconnectStaffTelegram} from "@/features/telegram-staff-onboarding/application/use-cases/force-disconnect-staff-telegram";
import {GetOwnTelegramConnection} from "@/features/telegram-staff-onboarding/application/use-cases/get-own-telegram-connection";
import {GetStaffTelegramConnection} from "@/features/telegram-staff-onboarding/application/use-cases/get-staff-telegram-connection";
import {ResolveTelegramStaffActor} from "@/features/telegram-staff-onboarding/application/use-cases/resolve-telegram-staff-actor";
import {RevokeOwnTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-own-telegram-connection-request";
import {RevokeStaffTelegramConnectionRequest} from "@/features/telegram-staff-onboarding/application/use-cases/revoke-staff-telegram-connection-request";
import {PostgresTelegramStaffOnboardingRepository} from "@/features/telegram-staff-onboarding/infrastructure/persistence/postgres/repositories/postgres-telegram-staff-onboarding-repository";
import {NodeTelegramConnectionTokenService, NodeTelegramStaffOnboardingIdGenerator} from "@/features/telegram-staff-onboarding/infrastructure/security/telegram-connection-token-service";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export type TelegramStaffOnboarding = Readonly<{
  getOwnConnection: GetOwnTelegramConnection;
  getStaffConnection: GetStaffTelegramConnection;
  createOwnConnectionRequest: CreateOwnTelegramConnectionRequest;
  consumeConnectionRequest: ConsumeTelegramConnectionRequest;
  disconnectOwn: DisconnectOwnTelegram;
  forceDisconnectStaff: ForceDisconnectStaffTelegram;
  revokeOwnConnectionRequest: RevokeOwnTelegramConnectionRequest;
  revokeStaffConnectionRequest: RevokeStaffTelegramConnectionRequest;
  resolveStaffActor: ResolveTelegramStaffActor;
}>;

let telegramStaffOnboarding: TelegramStaffOnboarding | undefined;

export function getTelegramStaffOnboarding(): TelegramStaffOnboarding {
  if (telegramStaffOnboarding) return telegramStaffOnboarding;
  const repository = new PostgresTelegramStaffOnboardingRepository(getInquiryPostgresPool());
  const tokens = new NodeTelegramConnectionTokenService();
  const ids = new NodeTelegramStaffOnboardingIdGenerator();
  const authorization = getStaffAuthentication().authorization;
  const clock = {now: () => new Date()};
  telegramStaffOnboarding = Object.freeze({
    getOwnConnection: new GetOwnTelegramConnection(repository, authorization),
    getStaffConnection: new GetStaffTelegramConnection(repository, authorization),
    createOwnConnectionRequest: new CreateOwnTelegramConnectionRequest(repository, tokens, authorization, clock),
    consumeConnectionRequest: new ConsumeTelegramConnectionRequest(repository, tokens, ids, authorization),
    disconnectOwn: new DisconnectOwnTelegram(repository, authorization),
    forceDisconnectStaff: new ForceDisconnectStaffTelegram(repository, authorization),
    revokeOwnConnectionRequest: new RevokeOwnTelegramConnectionRequest(repository, authorization),
    revokeStaffConnectionRequest: new RevokeStaffTelegramConnectionRequest(repository, authorization),
    resolveStaffActor: new ResolveTelegramStaffActor(repository, authorization),
  });
  return telegramStaffOnboarding;
}
