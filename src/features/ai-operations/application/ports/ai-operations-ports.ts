import type {AiOperationsEmergencyOverride, AiOperationsPolicyEventDto, AiOperationsPolicyEventType} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";

export class InvalidStoredAiOperationsPolicyError extends Error {
  constructor() { super("Stored AI operations policy is invalid."); this.name = "InvalidStoredAiOperationsPolicyError"; }
}

export type AiOperationsPolicyEvent = Readonly<{
  id: string;
  eventType: AiOperationsPolicyEventType;
  previousPolicy: AiOperationsPolicy | null;
  newPolicy: AiOperationsPolicy;
  actorReference: string;
  occurredAt: Date;
}>;

export interface AiOperationsPolicyRepository {
  find(): Promise<AiOperationsPolicy | null>;
  save(policy: AiOperationsPolicy, event: AiOperationsPolicyEvent, expectedVersion: number): Promise<"saved" | "conflict">;
  readEvents(limit: number): Promise<readonly AiOperationsPolicyEventDto[]>;
}

export interface AiOperationsClock { now(): Date; }
export interface AiOperationsEventIdGenerator { generate(): string; }
export interface AiOperationsEmergencyOverrideReader { read(): AiOperationsEmergencyOverride; }
