import "server-only";

import {InquiryRateLimiter, parseInquiryRateLimitConfig} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {inquiryDevelopmentOrigin} from "@/shared/config/inquiry-development";

const rateLimitConfig = parseInquiryRateLimitConfig();
const rateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerMessageRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerMessageHistoryRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerConversationMessageRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const customerConversationHistoryRateLimiter = new InquiryRateLimiter(rateLimitConfig);
const approvedDevelopmentOrigins = new Set([inquiryDevelopmentOrigin.origin]);

export function getInquiryHttpOptions() {
  return Object.freeze({rateLimiter, approvedDevelopmentOrigins});
}

export function getCustomerMessageHttpOptions() {
  return Object.freeze({rateLimiter: customerMessageRateLimiter, approvedDevelopmentOrigins});
}

export function getCustomerMessageHistoryHttpOptions() {
  return Object.freeze({rateLimiter: customerMessageHistoryRateLimiter, approvedDevelopmentOrigins});
}

export function getCustomerConversationMessageHttpOptions() {
  return Object.freeze({rateLimiter: customerConversationMessageRateLimiter, approvedDevelopmentOrigins});
}

export function getCustomerConversationHistoryHttpOptions() {
  return Object.freeze({rateLimiter: customerConversationHistoryRateLimiter, approvedDevelopmentOrigins});
}
