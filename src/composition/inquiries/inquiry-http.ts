import "server-only";

import {InquiryRateLimiter, parseInquiryRateLimitConfig} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {getApprovedDevelopmentOrigins, type DevelopmentOriginEnvironment} from "@/shared/config/inquiry-development";

const rateLimitConfig = parseInquiryRateLimitConfig();
const rateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerMessageRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerMessageHistoryRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerConversationMessageRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerConversationHistoryRateLimiter = new InquiryRateLimiter(rateLimitConfig);

export function getInquiryHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getCustomerMessageHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter: customerMessageRateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getCustomerMessageHistoryHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter: customerMessageHistoryRateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getCustomerConversationMessageHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter: customerConversationMessageRateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getCustomerConversationHistoryHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter: customerConversationHistoryRateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getCustomerConversationStreamHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}
