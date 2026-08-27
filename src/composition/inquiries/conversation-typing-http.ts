import "server-only";

import {getConversationAccessResolver} from "@/composition/inquiries/conversation-access";
import {
  getConversationForInquiryResolver,
  getConversationTypingRegistry,
  getConversationTypingUpdater,
} from "@/composition/inquiries/conversation-typing";
import {getStaffConversationStreamer} from "@/composition/inquiries/staff-conversation-stream";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {ConversationTypingRateLimiter, parseConversationTypingRateLimitConfig} from "@/features/inquiries/infrastructure/http/conversation-typing-rate-limiter";
import {createCustomerConversationTypingRequestHandler} from "@/features/inquiries/infrastructure/http/customer-conversation-typing-request-handler";
import {createStaffConversationTypingRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-typing-request-handler";
import {createStaffConversationStreamRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-stream-request-handler";
import {getApprovedDevelopmentOrigins, type DevelopmentOriginEnvironment} from "@/shared/config/inquiry-development";

const customerRateLimiter = new ConversationTypingRateLimiter(parseConversationTypingRateLimitConfig());
const staffRateLimiter = new ConversationTypingRateLimiter(parseConversationTypingRateLimitConfig());

export function getConversationTypingHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export const handleCustomerConversationTyping = createCustomerConversationTypingRequestHandler(
  getConversationAccessResolver,
  getConversationTypingUpdater,
  {...getConversationTypingHttpOptions(), rateLimiter: customerRateLimiter},
);

export const handleStaffConversationTyping = createStaffConversationTypingRequestHandler(
  getStaffAuthentication,
  getConversationForInquiryResolver,
  getConversationTypingUpdater,
  {...getConversationTypingHttpOptions(), rateLimiter: staffRateLimiter},
);

export const handleStaffConversationStream = createStaffConversationStreamRequestHandler(
  getStaffAuthentication,
  getConversationForInquiryResolver,
  getStaffConversationStreamer,
  getConversationTypingRegistry,
  getConversationTypingHttpOptions(),
);
