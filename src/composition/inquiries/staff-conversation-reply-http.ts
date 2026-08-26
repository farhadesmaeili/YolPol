import "server-only";

import {getStaffConversationReply} from "@/composition/inquiries/staff-conversation-reply";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {createStaffConversationReplyRequestHandler} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-request-handler";
import {inquiryDevelopmentOrigin} from "@/shared/config/inquiry-development";

const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());
const approvedDevelopmentOrigins = new Set([inquiryDevelopmentOrigin.origin]);

export const handleStaffConversationReply = createStaffConversationReplyRequestHandler(
  getStaffAuthentication,
  getStaffConversationReply,
  {approvedDevelopmentOrigins, rateLimiter},
);
