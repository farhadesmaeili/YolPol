import "server-only";

import {InquiryRateLimiter, parseInquiryRateLimitConfig} from "@/features/inquiries/infrastructure/http/inquiry-rate-limiter";
import {inquiryDevelopmentOrigin} from "@/shared/config/inquiry-development";

const rateLimiter = new InquiryRateLimiter(parseInquiryRateLimitConfig());

export function getInquiryHttpOptions() {
  return Object.freeze({rateLimiter, approvedDevelopmentOrigins: new Set([inquiryDevelopmentOrigin.origin])});
}
