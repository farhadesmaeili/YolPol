import {randomUUID} from "node:crypto";
import type {AiProviderRegistryEventIdGenerator} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";

export class NodeAiProviderRegistryEventIdGenerator implements AiProviderRegistryEventIdGenerator {
  constructor(private readonly uuid: () => string = randomUUID) {}
  generate(): string { return `aipre_${this.uuid()}`; }
}
