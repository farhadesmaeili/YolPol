import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffAuthHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";
import {getTelegramStaffOnboarding} from "@/composition/telegram-staff-onboarding/telegram-staff-onboarding";
import {
  createDisconnectOwnTelegramRequestHandler,
  createForceDisconnectStaffTelegramRequestHandler,
  createOwnTelegramConnectionRequestHandler,
  createOwnTelegramConnectionStateRequestHandler,
  createRevokeOwnTelegramRequestHandler,
  createRevokeStaffTelegramRequestHandler,
} from "@/features/telegram-staff-onboarding/infrastructure/http/telegram-staff-onboarding-request-handlers";
import {readPublicTelegramBotConfig} from "@/shared/config/telegram-bot";

const options = getStaffAuthHttpOptions();
const botUsername = () => readPublicTelegramBotConfig().username;

export const handleOwnTelegramConnectionState = createOwnTelegramConnectionStateRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, options);
export const handleCreateOwnTelegramConnectionRequest = createOwnTelegramConnectionRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, botUsername, options);
export const handleDisconnectOwnTelegram = createDisconnectOwnTelegramRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, options);
export const handleRevokeOwnTelegramRequest = createRevokeOwnTelegramRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, options);
export const handleForceDisconnectStaffTelegram = createForceDisconnectStaffTelegramRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, options);
export const handleRevokeStaffTelegramRequest = createRevokeStaffTelegramRequestHandler(getStaffAuthentication, getTelegramStaffOnboarding, options);
