import type {AiOperationsPolicyDto, AiOperationsPolicyEventDto, AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsUpdateInput} from "@/features/ai-operations/presentation/clients/ai-operations-client";
import type {AiOperationsMode} from "@/features/ai-operations/domain/types/ai-operations-types";

export type EnabledAiOperationsMode = Exclude<AiOperationsMode, "DISABLED">;
export type AiEmergencyStopState = "ACTIVE" | "DISABLED" | "ENVIRONMENT_DISABLED" | "UNCONFIGURED";

export type AiEmergencyStopView = Readonly<{
  state: AiEmergencyStopState;
  resumeMode: EnabledAiOperationsMode | null;
}>;

function enabledMode(value: AiOperationsPolicyDto | null): EnabledAiOperationsMode | null {
  return value?.mode === "FALLBACK" || value?.mode === "SCHEDULED" ? value.mode : null;
}

export function findAiOperationsResumeMode(events: readonly AiOperationsPolicyEventDto[]): EnabledAiOperationsMode | null {
  for (const event of events) {
    const previousMode = enabledMode(event.previousPolicy);
    if (previousMode) return previousMode;
    const newMode = enabledMode(event.newPolicy);
    if (newMode) return newMode;
  }
  return null;
}

export function presentAiEmergencyStop(
  status: AiOperationsStatusDto,
  events: readonly AiOperationsPolicyEventDto[],
): AiEmergencyStopView {
  if (status.emergencyOverride.active) return {state: "ENVIRONMENT_DISABLED", resumeMode: null};
  if (!status.policy) return {state: "UNCONFIGURED", resumeMode: null};
  if (status.policy.mode === "DISABLED") return {state: "DISABLED", resumeMode: findAiOperationsResumeMode(events)};
  return {state: "ACTIVE", resumeMode: status.policy.mode};
}

export function buildAiEmergencyStopUpdate(
  policy: AiOperationsPolicyDto,
  mode: "DISABLED" | EnabledAiOperationsMode,
): AiOperationsUpdateInput {
  return {
    expectedVersion: policy.version,
    mode,
    businessTimeZone: policy.businessTimeZone,
    humanGracePeriodSeconds: policy.humanGracePeriodSeconds,
    scheduleWindows: policy.scheduleWindows,
  };
}
