import "server-only";
import {getAiProviderRegistry} from "@/composition/ai-provider-registry/ai-provider-registry";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {createAiProviderRegistryAuditHandler, createGetAiProviderRegistryHandler, createMutateAiProviderRegistryHandler} from "@/features/ai-provider-registry/infrastructure/http/ai-provider-registry-request-handlers";
import {AiProviderRegistryRateLimiter, parseAiProviderRegistryRateLimitConfig} from "@/features/ai-provider-registry/infrastructure/http/ai-provider-registry-rate-limiter";
import {getApprovedDevelopmentOrigins} from "@/shared/config/inquiry-development";

const options = Object.freeze({rateLimiter: new AiProviderRegistryRateLimiter(parseAiProviderRegistryRateLimitConfig()), approvedDevelopmentOrigins: getApprovedDevelopmentOrigins()});
export const handleGetAiProviderRegistry = createGetAiProviderRegistryHandler(getStaffAuthentication, getAiProviderRegistry, options);
export const handleMutateAiProviderRegistry = createMutateAiProviderRegistryHandler(getStaffAuthentication, getAiProviderRegistry, options);
export const handleGetAiProviderRegistryAudit = createAiProviderRegistryAuditHandler(getStaffAuthentication, getAiProviderRegistry, options);
