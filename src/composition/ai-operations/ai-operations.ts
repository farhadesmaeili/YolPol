import "server-only";

import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {EvaluateAiOperationsAvailability} from "@/features/ai-operations/application/use-cases/evaluate-ai-operations-availability";
import {GetAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/get-ai-operations-policy";
import {ReadAiOperationsAuditHistory} from "@/features/ai-operations/application/use-cases/read-ai-operations-audit-history";
import {UpdateAiOperationsPolicy} from "@/features/ai-operations/application/use-cases/update-ai-operations-policy";
import {EnvironmentAiOperationsEmergencyOverride} from "@/features/ai-operations/infrastructure/config/environment-ai-operations-emergency-override";
import {PostgresAiOperationsPolicyRepository} from "@/features/ai-operations/infrastructure/persistence/postgres/repositories/postgres-ai-operations-policy-repository";
import {NodeAiOperationsEventIdGenerator} from "@/features/ai-operations/infrastructure/security/node-ai-operations-event-id-generator";

export type AiOperations = Readonly<{
  getPolicy: GetAiOperationsPolicy;
  updatePolicy: UpdateAiOperationsPolicy;
  readAuditHistory: ReadAiOperationsAuditHistory;
  evaluateAvailability: EvaluateAiOperationsAvailability;
}>;

let operations: AiOperations | undefined;

export function getAiOperations(): AiOperations {
  if (operations) return operations;
  const repository = new PostgresAiOperationsPolicyRepository(getInquiryPostgresPool());
  const authorization = getStaffAuthentication().authorization;
  const emergencyOverride = new EnvironmentAiOperationsEmergencyOverride();
  const clock = {now: () => new Date()};
  operations = Object.freeze({
    getPolicy: new GetAiOperationsPolicy(repository, authorization, emergencyOverride, clock),
    updatePolicy: new UpdateAiOperationsPolicy(repository, authorization, clock, new NodeAiOperationsEventIdGenerator()),
    readAuditHistory: new ReadAiOperationsAuditHistory(repository, authorization),
    evaluateAvailability: new EvaluateAiOperationsAvailability(repository, emergencyOverride, clock),
  });
  return operations;
}
