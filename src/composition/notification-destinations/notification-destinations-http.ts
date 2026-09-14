import "server-only";

import {getNotificationDestinationOperations} from "@/composition/notification-destinations/notification-destinations";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffAuthHttpOptions} from "@/composition/staff-authentication/staff-authentication-http";
import {createGetNotificationDestinationsHandler, createMutateNotificationDestinationsHandler} from "@/features/notification-destinations/infrastructure/http/notification-destination-request-handlers";
import {NotificationDestinationRateLimiter, parseNotificationDestinationRateLimitConfig} from "@/features/notification-destinations/infrastructure/http/notification-destination-rate-limiter";
import {readPublicTelegramBotConfig} from "@/shared/config/telegram-bot";

const options = Object.freeze({...getStaffAuthHttpOptions(), rateLimiter: new NotificationDestinationRateLimiter(parseNotificationDestinationRateLimitConfig())});
const botUsername = () => readPublicTelegramBotConfig().username;

export const handleGetNotificationDestinations = createGetNotificationDestinationsHandler(getStaffAuthentication, getNotificationDestinationOperations, options);
export const handleMutateNotificationDestinations = createMutateNotificationDestinationsHandler(getStaffAuthentication, getNotificationDestinationOperations, botUsername, options);
