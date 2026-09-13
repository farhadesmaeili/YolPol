import {describe, expect, it} from "vitest";

import type {AiOperationsPolicyDto, AiOperationsPolicyEventDto, AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {buildAiEmergencyStopUpdate, presentAiEmergencyStop} from "@/features/ai-operations/presentation/state/ai-emergency-stop-state";
import {presentAiOperationsUpdate} from "@/features/ai-operations/presentation/state/ai-operations-update-state";

const enabled: AiOperationsPolicyDto = {mode: "SCHEDULED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: [{weekday: "MONDAY", startMinute: 540, endMinute: 600, enabled: true}], version: 6, updatedAt: "2026-09-10T10:00:00.000Z", updatedBy: "staff:member-1"};
const disabled: AiOperationsPolicyDto = {...enabled, mode: "DISABLED", version: 7, updatedAt: "2026-09-10T10:01:00.000Z"};
const disableEvent: AiOperationsPolicyEventDto = {id: "event-7", eventType: "POLICY_UPDATED", previousVersion: 6, newVersion: 7, actorReference: "staff:member-1", occurredAt: disabled.updatedAt, previousPolicy: enabled, newPolicy: disabled};

function status(policy: AiOperationsPolicyDto | null, emergencyOverride: AiOperationsStatusDto["emergencyOverride"] = {active: false, state: "INACTIVE"}): AiOperationsStatusDto {
  return {policy, effectiveDecision: policy?.mode === "DISABLED" ? {allowed: false, reason: "POLICY_DISABLED"} : {allowed: true, reason: "ALLOWED_SCHEDULE"}, emergencyOverride};
}

describe("AI Emergency Stop presentation state", () => {
  it("presents active and disabled server-authoritative policy states", () => {
    expect(presentAiEmergencyStop(status(enabled), [])).toEqual({state: "ACTIVE", resumeMode: "SCHEDULED"});
    expect(presentAiEmergencyStop(status(disabled), [disableEvent])).toEqual({state: "DISABLED", resumeMode: "SCHEDULED"});
  });

  it("preserves policy settings and optimistic versioning for disable and re-enable", () => {
    expect(buildAiEmergencyStopUpdate(enabled, "DISABLED")).toEqual({expectedVersion: 6, mode: "DISABLED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: enabled.scheduleWindows});
    const reenable = buildAiEmergencyStopUpdate(disabled, "SCHEDULED");
    expect(reenable).toEqual({expectedVersion: 7, mode: "SCHEDULED", businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: enabled.scheduleWindows});
  });

  it("does not offer a false local enable when the environment override is authoritative", () => {
    expect(presentAiEmergencyStop(status(enabled, {active: true, state: "ACTIVE"}), [disableEvent])).toEqual({state: "ENVIRONMENT_DISABLED", resumeMode: null});
  });

  it("keeps the authoritative state unchanged when a mutation fails", () => {
    const authoritative = status(enabled);
    expect(presentAiOperationsUpdate({status: "failed"})).toEqual({notice: "failed", refresh: false});
    expect(presentAiEmergencyStop(authoritative, [])).toEqual({state: "ACTIVE", resumeMode: "SCHEDULED"});
  });
});
