import "server-only";

import {getStaffConversationReply} from "@/composition/inquiries/staff-conversation-reply";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {createStaffConversationReplyRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-request-handler";
import {getApprovedDevelopmentOrigins, type DevelopmentOriginEnvironment} from "@/shared/config/inquiry-development";

const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());

export function getStaffConversationReplyHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment), rateLimiter});
}

export const handleStaffConversationReply = createStaffConversationReplyRequestHandler(
  getStaffAuthentication,
  getStaffConversationReply,
  getStaffConversationReplyHttpOptions(),
);
