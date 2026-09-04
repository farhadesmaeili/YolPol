import type {AiOperationsEmergencyOverrideReader, AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {InvalidStoredAiOperationsPolicyError} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {findNextAiOperationsEligibleInstant} from "@/features/ai-operations/domain/services/evaluate-ai-operations-policy";

export const maximumAiFallbackSchedulingHorizonMs = 24 * 60 * 60 * 1_000;

export type PlanAiOperationsFallbackResult =
  | Readonly<{status: "scheduled"; notBefore: Date}>
  | Readonly<{status: "suppressed"; reason: "DISABLED" | "EMERGENCY_DISABLED" | "NO_WINDOW_WITHIN_HORIZON" | "POLICY_INVALID" | "POLICY_UNAVAILABLE"}>;

export class PlanAiOperationsFallback {
  constructor(
    private readonly repository: AiOperationsPolicyRepository,
    private readonly emergencyOverride: AiOperationsEmergencyOverrideReader,
  ) {}

  async execute(input: Readonly<{triggeredAt: Date}>): Promise<PlanAiOperationsFallbackResult> {
    if (!(input.triggeredAt instanceof Date) || !Number.isFinite(input.triggeredAt.getTime())) {
      return {status: "suppressed", reason: "POLICY_UNAVAILABLE"};
    }
    try {
      if (this.emergencyOverride.read().active) return {status: "suppressed", reason: "EMERGENCY_DISABLED"};
      const policy = await this.repository.find();
      if (!policy) return {status: "suppressed", reason: "POLICY_UNAVAILABLE"};
      if (policy.mode === "DISABLED") return {status: "suppressed", reason: "DISABLED"};
      const graceDeadline = new Date(input.triggeredAt.getTime() + policy.humanGracePeriodSeconds * 1_000);
      const horizon = new Date(input.triggeredAt.getTime() + maximumAiFallbackSchedulingHorizonMs);
      const notBefore = findNextAiOperationsEligibleInstant(policy, graceDeadline, horizon);
      return notBefore
        ? {status: "scheduled", notBefore}
        : {status: "suppressed", reason: "NO_WINDOW_WITHIN_HORIZON"};
    } catch (error) {
      return {status: "suppressed", reason: error instanceof InvalidStoredAiOperationsPolicyError ? "POLICY_INVALID" : "POLICY_UNAVAILABLE"};
    }
  }
}
