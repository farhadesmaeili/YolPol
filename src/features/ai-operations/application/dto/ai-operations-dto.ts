import type {AiOperationsDecision, AiOperationsMode, AiScheduleWindow} from "@/features/ai-operations/domain/types/ai-operations-types";

export type AiOperationsPolicyDto = Readonly<{
  mode: AiOperationsMode;
  businessTimeZone: string;
  humanGracePeriodSeconds: number;
  scheduleWindows: readonly AiScheduleWindow[];
  version: number;
  updatedAt: string;
  updatedBy: string;
}>;

export type AiOperationsEmergencyOverride = Readonly<{
  active: boolean;
  state: "INACTIVE" | "ACTIVE" | "INVALID";
}>;

export type AiOperationsPolicyEventType = "POLICY_CREATED" | "POLICY_UPDATED";

export type AiOperationsPolicyEventDto = Readonly<{
  id: string;
  eventType: AiOperationsPolicyEventType;
  previousVersion: number | null;
  newVersion: number;
  actorReference: string;
  occurredAt: string;
  previousPolicy: AiOperationsPolicyDto | null;
  newPolicy: AiOperationsPolicyDto;
}>;

export type AiOperationsStatusDto = Readonly<{
  policy: AiOperationsPolicyDto | null;
  effectiveDecision: AiOperationsDecision;
  emergencyOverride: AiOperationsEmergencyOverride;
}>;
