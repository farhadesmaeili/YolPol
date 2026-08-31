import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AiOperationsStatusDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {toAiOperationsPolicyDto} from "@/features/ai-operations/application/mappers/ai-operations-policy-dto-mapper";
import {InvalidStoredAiOperationsPolicyError, type AiOperationsClock, type AiOperationsEmergencyOverrideReader, type AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {evaluateAiOperationsPolicy} from "@/features/ai-operations/domain/services/evaluate-ai-operations-policy";

export type GetAiOperationsPolicyResult = Readonly<{status: "found"; value: AiOperationsStatusDto}>
  | Readonly<{status: "forbidden"}>
  | Readonly<{status: "unavailable"; reason: "POLICY_UNAVAILABLE" | "POLICY_INVALID"}>;

export class GetAiOperationsPolicy {
  constructor(
    private readonly repository: AiOperationsPolicyRepository,
    private readonly authorization: StaffAuthorization,
    private readonly emergencyOverride: AiOperationsEmergencyOverrideReader,
    private readonly clock: AiOperationsClock,
  ) {}

  async execute(principal: StaffPrincipal): Promise<GetAiOperationsPolicyResult> {
    if (!this.authorization.mayViewAiOperations(principal)) return {status: "forbidden"};
    try {
      const override = this.emergencyOverride.read();
      const policy = await this.repository.find();
      const effectiveDecision = override.active
        ? {allowed: false, reason: "EMERGENCY_DISABLED" as const}
        : policy
          ? evaluateAiOperationsPolicy(policy, this.clock.now())
          : {allowed: false, reason: "POLICY_UNAVAILABLE" as const};
      return {status: "found", value: {policy: policy ? toAiOperationsPolicyDto(policy) : null, effectiveDecision, emergencyOverride: override}};
    } catch (error) {
      return {status: "unavailable", reason: error instanceof InvalidStoredAiOperationsPolicyError ? "POLICY_INVALID" : "POLICY_UNAVAILABLE"};
    }
  }
}
