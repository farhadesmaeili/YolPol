import {parseAiGenerationSettings, parseAiProviderCapabilities, parseAiProviderModelIdentifier, parseAiRegistryActor, parseAiRegistryDate, parseAiRegistryDisplayName, parseAiRegistryEnabled, parseAiRegistryPriority, parseAiRegistryStableId, parseAiRegistryVersion} from "@/features/ai-provider-registry/domain/value-objects/ai-provider-registry-values";

export type AiModelProfileInput = Readonly<{id: unknown; providerId: unknown; name: unknown; modelIdentifier: unknown; enabled: unknown; priority: unknown; capabilities: unknown; generationSettings: unknown; version: unknown; createdAt: unknown; updatedAt: unknown; updatedBy: unknown}>;

export class AiModelProfile {
  readonly id: string; readonly providerId: string; readonly name: string; readonly modelIdentifier: string; readonly enabled: boolean; readonly priority: number;
  readonly capabilities; readonly generationSettings; readonly version: number; readonly createdAt: Date; readonly updatedAt: Date; readonly updatedBy: string;

  private constructor(input: AiModelProfileInput) {
    this.id = parseAiRegistryStableId(input.id, "id"); this.providerId = parseAiRegistryStableId(input.providerId, "providerId");
    this.name = parseAiRegistryDisplayName(input.name, "name"); this.modelIdentifier = parseAiProviderModelIdentifier(input.modelIdentifier);
    this.enabled = parseAiRegistryEnabled(input.enabled); this.priority = parseAiRegistryPriority(input.priority);
    this.capabilities = parseAiProviderCapabilities(input.capabilities); this.generationSettings = parseAiGenerationSettings(input.generationSettings);
    this.version = parseAiRegistryVersion(input.version); this.createdAt = parseAiRegistryDate(input.createdAt, "createdAt");
    this.updatedAt = parseAiRegistryDate(input.updatedAt, "updatedAt"); this.updatedBy = parseAiRegistryActor(input.updatedBy);
    if (this.updatedAt.getTime() < this.createdAt.getTime()) throw new Error("Profile update time cannot precede creation time.");
    Object.freeze(this);
  }

  static create(input: AiModelProfileInput): AiModelProfile { return new AiModelProfile(input); }
  static restore(input: AiModelProfileInput): AiModelProfile { return new AiModelProfile(input); }
}
