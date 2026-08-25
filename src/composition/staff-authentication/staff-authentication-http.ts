import "server-only";

import {StaffLoginRateLimiter, parseStaffLoginRateLimitConfig} from "@/features/staff-authentication/infrastructure/http/staff-login-rate-limiter";
import {inquiryDevelopmentOrigin} from "@/shared/config/inquiry-development";

const loginRateLimiter = new StaffLoginRateLimiter(parseStaffLoginRateLimitConfig());
const approvedDevelopmentOrigins = new Set([inquiryDevelopmentOrigin.origin]);

export function getStaffLoginHttpOptions() {
  return Object.freeze({rateLimiter: loginRateLimiter, approvedDevelopmentOrigins});
}

export function getStaffAuthHttpOptions() {
  return Object.freeze({approvedDevelopmentOrigins});
}

