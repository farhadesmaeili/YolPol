import {describe, expect, it} from "vitest";

import {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";
import {evaluateAiOperationsPolicy} from "@/features/ai-operations/domain/services/evaluate-ai-operations-policy";

const base = {
  mode: "SCHEDULED" as const,
  businessTimeZone: "Asia/Tehran",
  humanGracePeriodSeconds: 900,
  version: 1,
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedBy: "staff:member-1",
};

describe("AiOperationsPolicy", () => {
  it("normalizes overnight windows across the week boundary and orders them deterministically", () => {
    const policy = AiOperationsPolicy.create({...base, scheduleWindows: [
      {weekday: "SUNDAY", startMinute: 1_200, endMinute: 480, enabled: true},
      {weekday: "WEDNESDAY", startMinute: 540, endMinute: 600, enabled: false},
    ]});
    expect(policy.scheduleWindows).toEqual([
      {weekday: "MONDAY", startMinute: 0, endMinute: 480, enabled: true},
      {weekday: "WEDNESDAY", startMinute: 540, endMinute: 600, enabled: false},
      {weekday: "SUNDAY", startMinute: 1_200, endMinute: 1_440, enabled: true},
    ]);
  });

  it.each([
    [[{weekday: "MONDAY", startMinute: 600, endMinute: 600, enabled: true}], "positive duration"],
    [[{weekday: "MONDAY", startMinute: 540, endMinute: 660, enabled: true}, {weekday: "MONDAY", startMinute: 600, endMinute: 720, enabled: false}], "overlap"],
    [[{weekday: "MONDAY", startMinute: 540, endMinute: 660, enabled: true}, {weekday: "MONDAY", startMinute: 540, endMinute: 660, enabled: true}], "overlap"],
  ])("rejects invalid schedule sets", (scheduleWindows, message) => {
    expect(() => AiOperationsPolicy.create({...base, scheduleWindows})).toThrowError(new RegExp(message, "iu"));
  });

  it("rejects scheduled mode without an enabled window, invalid IANA zones, grace bounds, and forged actors", () => {
    expect(() => AiOperationsPolicy.create({...base, scheduleWindows: [{weekday: "MONDAY", startMinute: 540, endMinute: 600, enabled: false}]})).toThrow(AiOperationsPolicyValidationError);
    expect(() => AiOperationsPolicy.create({...base, businessTimeZone: "Mars/Olympus", scheduleWindows: []})).toThrow(AiOperationsPolicyValidationError);
    expect(() => AiOperationsPolicy.create({...base, humanGracePeriodSeconds: 59, scheduleWindows: []})).toThrow(AiOperationsPolicyValidationError);
    expect(() => AiOperationsPolicy.create({...base, updatedBy: "browser:member-1", scheduleWindows: []})).toThrow(AiOperationsPolicyValidationError);
  });

  it("evaluates schedule boundaries in the configured zone without using process local time", () => {
    const policy = AiOperationsPolicy.create({...base, scheduleWindows: [{weekday: "MONDAY", startMinute: 540, endMinute: 600, enabled: true}]});
    expect(evaluateAiOperationsPolicy(policy, new Date("2026-09-07T05:30:00.000Z"))).toEqual({allowed: true, reason: "ALLOWED_SCHEDULE"});
    expect(evaluateAiOperationsPolicy(policy, new Date("2026-09-07T06:30:00.000Z"))).toEqual({allowed: false, reason: "OUTSIDE_SCHEDULE"});
  });

  it("evaluates both normalized sides of an overnight weekday boundary", () => {
    const policy = AiOperationsPolicy.create({...base, scheduleWindows: [{weekday: "SUNDAY", startMinute: 1_200, endMinute: 120, enabled: true}]});
    expect(evaluateAiOperationsPolicy(policy, new Date("2026-09-06T19:30:00.000Z"))).toEqual({allowed: true, reason: "ALLOWED_SCHEDULE"});
    expect(evaluateAiOperationsPolicy(policy, new Date("2026-09-06T21:30:00.000Z"))).toEqual({allowed: true, reason: "ALLOWED_SCHEDULE"});
    expect(evaluateAiOperationsPolicy(policy, new Date("2026-09-06T23:00:00.000Z"))).toEqual({allowed: false, reason: "OUTSIDE_SCHEDULE"});
  });

  it("returns typed disabled and fallback decisions", () => {
    const disabled = AiOperationsPolicy.create({...base, mode: "DISABLED", scheduleWindows: []});
    const fallback = AiOperationsPolicy.create({...base, mode: "FALLBACK", scheduleWindows: []});
    expect(evaluateAiOperationsPolicy(disabled, base.updatedAt)).toEqual({allowed: false, reason: "POLICY_DISABLED"});
    expect(evaluateAiOperationsPolicy(fallback, base.updatedAt)).toEqual({allowed: true, reason: "ALLOWED_FALLBACK"});
  });
});
