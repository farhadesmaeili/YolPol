import "server-only";
import {getConversationTranslationControl} from "@/composition/conversation-translation/conversation-translation-control";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {createGetGlobalTranslationSettingsRequestHandler, createUpdateGlobalTranslationSettingsRequestHandler} from "@/features/conversation-translation/infrastructure/http/global-translation-settings-request-handler";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());
const options = {approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(), rateLimiter};
export const handleGetGlobalTranslationSettings = createGetGlobalTranslationSettingsRequestHandler(getStaffAuthentication, getConversationTranslationControl, options);
export const handleUpdateGlobalTranslationSettings = createUpdateGlobalTranslationSettingsRequestHandler(getStaffAuthentication, getConversationTranslationControl, options);
