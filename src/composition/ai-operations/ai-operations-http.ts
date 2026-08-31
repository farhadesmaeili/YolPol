import "server-only";

import {getAiOperations} from "@/composition/ai-operations/ai-operations";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {AiOperationsRateLimiter, parseAiOperationsRateLimitConfig} from "@/features/ai-operations/infrastructure/http/ai-operations-rate-limiter";
import {createAiOperationsAuditRequestHandler, createGetAiOperationsRequestHandler, createUpdateAiOperationsRequestHandler} from "@/features/ai-operations/infrastructure/http/ai-operations-request-handlers";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

const rateLimiter = new AiOperationsRateLimiter(parseAiOperationsRateLimitConfig());
const options = Object.freeze({rateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins()});

export const handleGetAiOperations = createGetAiOperationsRequestHandler(getStaffAuthentication, getAiOperations, options);
export const handleUpdateAiOperations = createUpdateAiOperationsRequestHandler(getStaffAuthentication, getAiOperations, options);
export const handleGetAiOperationsAudit = createAiOperationsAuditRequestHandler(getStaffAuthentication, getAiOperations, options);
