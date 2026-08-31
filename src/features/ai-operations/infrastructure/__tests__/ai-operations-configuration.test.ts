import {describe, expect, it} from "vitest";

import {parseAiOperationsEmergencyOverride} from "@/features/ai-operations/infrastructure/config/environment-ai-operations-emergency-override";
import {parseAiOperationsRateLimitConfig} from "@/features/ai-operations/infrastructure/http/ai-operations-rate-limiter";
import {NodeAiOperationsEventIdGenerator} from "@/features/ai-operations/infrastructure/security/node-ai-operations-event-id-generator";

describe("AI Operations infrastructure configuration", () => {
  it("keeps false and absent emergency values inactive and fails closed for true or invalid values", () => {
    expect(parseAiOperationsEmergencyOverride(undefined)).toEqual({active: false, state: "INACTIVE"});
    expect(parseAiOperationsEmergencyOverride(" false ")).toEqual({active: false, state: "INACTIVE"});
    expect(parseAiOperationsEmergencyOverride("TRUE")).toEqual({active: true, state: "ACTIVE"});
    expect(parseAiOperationsEmergencyOverride("yes")).toEqual({active: true, state: "INVALID"});
  });

  it("validates bounded dedicated mutation limiter configuration", () => {
    expect(parseAiOperationsRateLimitConfig({})).toEqual({maxRequests: 30, windowMs: 60_000});
    expect(parseAiOperationsRateLimitConfig({STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS: "4", STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS: "10"})).toEqual({maxRequests: 4, windowMs: 10_000});
    expect(() => parseAiOperationsRateLimitConfig({STAFF_AI_OPERATIONS_RATE_LIMIT_MAX_REQUESTS: "0"})).toThrow(/1 to 1000/u);
    expect(() => parseAiOperationsRateLimitConfig({STAFF_AI_OPERATIONS_RATE_LIMIT_WINDOW_SECONDS: "NaN"})).toThrow(/1 to 3600/u);
  });

  it("uses a server cryptographic UUID source for bounded event identifiers", () => {
    expect(new NodeAiOperationsEventIdGenerator(() => "123e4567-e89b-42d3-a456-426614174000").generate()).toBe("aipe_123e4567-e89b-42d3-a456-426614174000");
  });
});
