import "server-only";

import {StaffLoginRateLimiter, parseStaffLoginRateLimitConfig} from "@/features/staff-authentication/infrastructure/http/staff-login-rate-limiter";
import {getApprovedDevelopmentOrigins, type DevelopmentOriginEnvironment} from "@/shared/config/inquiry-development";

const loginRateLimiter = new StaffLoginRateLimiter(parseStaffLoginRateLimitConfig());

export function getStaffLoginHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({rateLimiter: loginRateLimiter, approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}

export function getStaffAuthHttpOptions(environment: DevelopmentOriginEnvironment = process.env) {
  return Object.freeze({approvedDevelopmentOrigins: getApprovedDevelopmentOrigins(environment)});
}
