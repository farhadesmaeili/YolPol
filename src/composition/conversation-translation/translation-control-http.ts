import "server-only";
import {getConversationTranslationControl} from "@/composition/conversation-translation/conversation-translation-control";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {createTranslationControlRequestHandler} from "@/features/conversation-translation/infrastructure/http/translation-control-request-handler";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());
export const handleTranslationControl = createTranslationControlRequestHandler(
  getStaffAuthentication,
  getConversationTranslationControl,
  {approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(), rateLimiter},
);
