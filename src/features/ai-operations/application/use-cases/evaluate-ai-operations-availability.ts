import type {AiOperationsDecision} from "@/features/ai-operations/domain/types/ai-operations-types";
import {evaluateAiOperationsPolicy} from "@/features/ai-operations/domain/services/evaluate-ai-operations-policy";
import {InvalidStoredAiOperationsPolicyError, type AiOperationsClock, type AiOperationsEmergencyOverrideReader, type AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";

export class EvaluateAiOperationsAvailability {
  constructor(
    private readonly repository: AiOperationsPolicyRepository,
    private readonly emergencyOverride: AiOperationsEmergencyOverrideReader,
    private readonly clock: AiOperationsClock,
  ) {}

  async execute(): Promise<AiOperationsDecision> {
    try {
      const override = this.emergencyOverride.read();
      if (override.active) return {allowed: false, reason: "EMERGENCY_DISABLED"};
      const policy = await this.repository.find();
      if (!policy) return {allowed: false, reason: "POLICY_UNAVAILABLE"};
      return evaluateAiOperationsPolicy(policy, this.clock.now());
    } catch (error) {
      return error instanceof InvalidStoredAiOperationsPolicyError
        ? {allowed: false, reason: "POLICY_INVALID"}
        : {allowed: false, reason: "POLICY_UNAVAILABLE"};
    }
  }
}
