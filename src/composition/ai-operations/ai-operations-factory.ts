import type {Pool} from "pg";

import {EvaluateAiOperationsAvailability} from "@/features/ai-operations/application/use-cases/evaluate-ai-operations-availability";
import {GetAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/get-ai-operations-policy";
import {PlanAiOperationsFallback} from "@/features/ai-operations/application/use-cases/plan-ai-operations-fallback";
import {ReadAiOperationsAuditHistory} from "@/features/ai-operations/application/use-cases/read-ai-operations-audit-history";
import {UpdateAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/update-ai-operations-policy";
import {EnvironmentAiOperationsEmergencyOverride} from "@/features/ai-operations/infrastructure/config/environment-ai-operations-emergency-override";
import {PostgresAiOperationsPolicyRepository} from "@/features/ai-operations/infrastructure/persistence/postgres/repositories/postgres-ai-operations-policy-repository";
import {NodeAiOperationsEventIdGenerator} from "@/features/ai-operations/infrastructure/security/node-ai-operations-event-id-generator";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

export type AiOperations = Readonly<{
  getPolicy: GetAiOperationsPolicy;
  updatePolicy: UpdateAiOperationsPolicy;
  readAuditHistory: ReadAiOperationsAuditHistory;
  evaluateAvailability: EvaluateAiOperationsAvailability;
  planFallback: PlanAiOperationsFallback;
}>;

export function createAiOperations(pool: Pool): AiOperations {
  const repository = new PostgresAiOperationsPolicyRepository(pool);
  const authorization = new StaffAuthorizationPolicy();
  const emergencyOverride = new EnvironmentAiOperationsEmergencyOverride();
  const clock = {now: () => new Date()};
  return Object.freeze({
    getPolicy: new GetAiOperationsPolicy(repository, authorization, emergencyOverride, clock),
    updatePolicy: new UpdateAiOperationsPolicy(repository, authorization, clock, new NodeAiOperationsEventIdGenerator()),
    readAuditHistory: new ReadAiOperationsAuditHistory(repository, authorization),
    evaluateAvailability: new EvaluateAiOperationsAvailability(repository, emergencyOverride, clock),
    planFallback: new PlanAiOperationsFallback(repository, emergencyOverride),
  });
}
