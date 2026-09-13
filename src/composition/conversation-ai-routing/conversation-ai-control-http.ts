import "server-only";

import {getConversationAiRouting} from "@/composition/conversation-ai-routing/conversation-ai-routing";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {createConversationAiControlRequestHandler} from "@/features/conversation-ai-routing/infrastructure/http/conversation-ai-control-request-handler";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());
export const handleConversationAiControl = createConversationAiControlRequestHandler(
  getStaffAuthentication,
  getConversationAiRouting,
  {approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(), rateLimiter},
);
