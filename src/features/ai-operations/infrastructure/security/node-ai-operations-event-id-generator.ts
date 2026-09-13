import {randomUUID} from "node:crypto";

import type {AiOperationsEventIdGenerator} from "@/features/ai-operations/application/ports/ai-operations-ports";

export class NodeAiOperationsEventIdGenerator implements AiOperationsEventIdGenerator {
  constructor(private readonly generateUuid: () => string = randomUUID) {}
  generate(): string { return `aipe_${this.generateUuid()}`; }
}
