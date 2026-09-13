import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AiOperationsPolicyDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import {toAiOperationsPolicyDto} from "@/features/ai-operations/application/mappers/ai-operations-policy-dto-mapper";
import {InvalidStoredAiOperationsPolicyError, type AiOperationsClock, type AiOperationsEventIdGenerator, type AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";
import {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";
import {AiOperationsPolicyValidationError} from "@/features/ai-operations/domain/errors/ai-operations-policy-errors";
import type {AiScheduleWindowInput} from "@/features/ai-operations/domain/types/ai-operations-types";

export type UpdateAiOperationsPolicyResult = Readonly<{status: "updated"; policy: AiOperationsPolicyDto}>
  | Readonly<{status: "forbidden" | "conflict" | "unavailable" | "policy_invalid"}>
  | Readonly<{status: "validation_failed"; field: string}>;

export class UpdateAiOperationsPolicy {
  constructor(
    private readonly repository: AiOperationsPolicyRepository,
    private readonly authorization: StaffAuthorization,
    private readonly clock: AiOperationsClock,
    private readonly eventIds: AiOperationsEventIdGenerator,
  ) {}

  async execute(input: Readonly<{
    principal: StaffPrincipal;
    expectedVersion: unknown;
    mode: unknown;
    businessTimeZone: unknown;
    humanGracePeriodSeconds: unknown;
    scheduleWindows: readonly AiScheduleWindowInput[];
  }>): Promise<UpdateAiOperationsPolicyResult> {
    if (!this.authorization.mayManageAiOperations(input.principal)) return {status: "forbidden"};
    if (!Number.isSafeInteger(input.expectedVersion) || (input.expectedVersion as number) < 0 || (input.expectedVersion as number) >= 2_147_483_647) {
      return {status: "validation_failed", field: "expectedVersion"};
    }
    const expectedVersion = input.expectedVersion as number;
    let previous: AiOperationsPolicy | null;
    try { previous = await this.repository.find(); }
    catch (error) { return {status: error instanceof InvalidStoredAiOperationsPolicyError ? "policy_invalid" : "unavailable"}; }
    if ((previous?.version ?? 0) !== expectedVersion) return {status: "conflict"};

    try {
      const updatedAt = this.clock.now();
      if (!(updatedAt instanceof Date) || !Number.isFinite(updatedAt.getTime())) return {status: "unavailable"};
      const updatedBy = this.authorization.actorReferenceFor(input.principal);
      const policy = AiOperationsPolicy.create({
        mode: input.mode,
        businessTimeZone: input.businessTimeZone,
        humanGracePeriodSeconds: input.humanGracePeriodSeconds,
        scheduleWindows: input.scheduleWindows,
        version: expectedVersion + 1,
        updatedAt,
        updatedBy,
      });
      const event = {
        id: this.eventIds.generate(),
        eventType: previous ? "POLICY_UPDATED" as const : "POLICY_CREATED" as const,
        previousPolicy: previous,
        newPolicy: policy,
        actorReference: updatedBy,
        occurredAt: updatedAt,
      };
      const result = await this.repository.save(policy, event, expectedVersion);
      return result === "saved" ? {status: "updated", policy: toAiOperationsPolicyDto(policy)} : {status: "conflict"};
    } catch (error) {
      if (error instanceof AiOperationsPolicyValidationError) return {status: "validation_failed", field: error.field};
      return {status: "unavailable"};
    }
  }
}
