import {parseAiProviderAdapterKey, parseAiRegistryActor, parseAiRegistryDate, parseAiRegistryDisplayName, parseAiRegistryEnabled, parseAiRegistryPriority, parseAiRegistryStableId, parseAiRegistryVersion} from "@/features/ai-provider-registry/domain/value-objects/ai-provider-registry-values";

export type AiProviderConfigurationInput = Readonly<{id: unknown; adapterKey: unknown; displayName: unknown; enabled: unknown; priority: unknown; version: unknown; createdAt: unknown; updatedAt: unknown; updatedBy: unknown}>;

export class AiProviderConfiguration {
  readonly id: string; readonly adapterKey: string; readonly displayName: string; readonly enabled: boolean; readonly priority: number;
  readonly version: number; readonly createdAt: Date; readonly updatedAt: Date; readonly updatedBy: string;

  private constructor(input: AiProviderConfigurationInput) {
    this.id = parseAiRegistryStableId(input.id, "id"); this.adapterKey = parseAiProviderAdapterKey(input.adapterKey);
    this.displayName = parseAiRegistryDisplayName(input.displayName, "displayName"); this.enabled = parseAiRegistryEnabled(input.enabled);
    this.priority = parseAiRegistryPriority(input.priority); this.version = parseAiRegistryVersion(input.version);
    this.createdAt = parseAiRegistryDate(input.createdAt, "createdAt"); this.updatedAt = parseAiRegistryDate(input.updatedAt, "updatedAt");
    this.updatedBy = parseAiRegistryActor(input.updatedBy);
    if (this.updatedAt.getTime() < this.createdAt.getTime()) throw new Error("Provider update time cannot precede creation time.");
    Object.freeze(this);
  }

  static create(input: AiProviderConfigurationInput): AiProviderConfiguration { return new AiProviderConfiguration(input); }
  static restore(input: AiProviderConfigurationInput): AiProviderConfiguration { return new AiProviderConfiguration(input); }
}
