import "server-only";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {RemediateTranslation} from "@/features/conversation-translation/application/use-cases/remediate-translation";
import {PostgresTranslationRemediationRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-remediation-repository";
import {createTranslationRemediationRequestHandler} from "@/features/conversation-translation/infrastructure/http/translation-remediation-request-handler";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";
import {StaffConversationReplyRateLimiter, parseStaffConversationReplyRateLimitConfig} from "@/features/inquiries/infrastructure/http/staff-conversation-reply-rate-limiter";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

let remediation: RemediateTranslation | undefined;
const rateLimiter = new StaffConversationReplyRateLimiter(parseStaffConversationReplyRateLimitConfig());
export const handleTranslationRemediation = createTranslationRemediationRequestHandler(getStaffAuthentication,
  () => remediation ??= new RemediateTranslation(new PostgresTranslationRemediationRepository(createPostgresPool(readPostgresConfig())), new StaffAuthorizationPolicy()),
  {approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(), rateLimiter});
