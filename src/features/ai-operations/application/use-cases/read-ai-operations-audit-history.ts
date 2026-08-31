import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AiOperationsPolicyEventDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";

export type ReadAiOperationsAuditHistoryResult = Readonly<{status: "found"; events: readonly AiOperationsPolicyEventDto[]}>
  | Readonly<{status: "forbidden" | "unavailable"}>;

export class ReadAiOperationsAuditHistory {
  constructor(private readonly repository: AiOperationsPolicyRepository, private readonly authorization: StaffAuthorization) {}

  async execute(principal: StaffPrincipal, limit = 100): Promise<ReadAiOperationsAuditHistoryResult> {
    if (!this.authorization.mayViewAiOperations(principal)) return {status: "forbidden"};
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) return {status: "unavailable"};
    try { return {status: "found", events: await this.repository.readEvents(limit)}; }
    catch { return {status: "unavailable"}; }
  }
}
