import type {AiOperationsEmergencyOverride, AiOperationsPolicyEventDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsClock, AiOperationsEmergencyOverrideReader, AiOperationsEventIdGenerator, AiOperationsPolicyEvent, AiOperationsPolicyRepository} from "@/features/ai-operations/application/ports/ai-operations-ports";
import type {AiOperationsPolicy} from "@/features/ai-operations/domain/entities/ai-operations-policy";

export class FakeAiOperationsRepository implements AiOperationsPolicyRepository {
  policy: AiOperationsPolicy | null = null;
  events: AiOperationsPolicyEvent[] = [];
  eventDtos: AiOperationsPolicyEventDto[] = [];
  findError: unknown;
  saveError: unknown;
  saveResult: "saved" | "conflict" = "saved";

  async find(): Promise<AiOperationsPolicy | null> { if (this.findError !== undefined) throw this.findError; return this.policy; }
  async save(policy: AiOperationsPolicy, event: AiOperationsPolicyEvent, expectedVersion: number): Promise<"saved" | "conflict"> {
    if (this.saveError !== undefined) throw this.saveError;
    if (this.saveResult === "conflict" || (this.policy?.version ?? 0) !== expectedVersion) return "conflict";
    this.policy = policy;
    this.events.push(event);
    return "saved";
  }
  async readEvents(limit: number): Promise<readonly AiOperationsPolicyEventDto[]> { return this.eventDtos.slice(0, limit); }
}

export class FakeAiOperationsClock implements AiOperationsClock {
  constructor(public instant = new Date("2026-09-07T05:30:00.000Z")) {}
  now(): Date { return new Date(this.instant); }
}

export class FakeAiOperationsEventIdGenerator implements AiOperationsEventIdGenerator {
  generate(): string { return "aipe_event-1"; }
}

export class FakeAiOperationsEmergencyOverride implements AiOperationsEmergencyOverrideReader {
  constructor(public value: AiOperationsEmergencyOverride = {active: false, state: "INACTIVE"}) {}
  read(): AiOperationsEmergencyOverride { return this.value; }
}
