import {parseAiCredentialReference, parseAiRegistryActor, parseAiRegistryDate, parseAiRegistryDisplayName, parseAiRegistryEnabled, parseAiRegistryPriority, parseAiRegistryStableId, parseAiRegistryVersion} from "@/features/ai-provider-registry/domain/value-objects/ai-provider-registry-values";

export type AiCredentialReferenceInput = Readonly<{id: unknown; providerId: unknown; alias: unknown; credentialReference: unknown; enabled: unknown; priority: unknown; version: unknown; createdAt: unknown; updatedAt: unknown; updatedBy: unknown}>;

export class AiCredentialReference {
  readonly id: string; readonly providerId: string; readonly alias: string; readonly credentialReference: string; readonly enabled: boolean; readonly priority: number;
  readonly version: number; readonly createdAt: Date; readonly updatedAt: Date; readonly updatedBy: string;

  private constructor(input: AiCredentialReferenceInput) {
    this.id = parseAiRegistryStableId(input.id, "id"); this.providerId = parseAiRegistryStableId(input.providerId, "providerId");
    this.alias = parseAiRegistryDisplayName(input.alias, "alias"); this.credentialReference = parseAiCredentialReference(input.credentialReference);
    this.enabled = parseAiRegistryEnabled(input.enabled); this.priority = parseAiRegistryPriority(input.priority);
    this.version = parseAiRegistryVersion(input.version); this.createdAt = parseAiRegistryDate(input.createdAt, "createdAt");
    this.updatedAt = parseAiRegistryDate(input.updatedAt, "updatedAt"); this.updatedBy = parseAiRegistryActor(input.updatedBy);
    if (this.updatedAt.getTime() < this.createdAt.getTime()) throw new Error("Credential-reference update time cannot precede creation time.");
    Object.freeze(this);
  }

  static create(input: AiCredentialReferenceInput): AiCredentialReference { return new AiCredentialReference(input); }
  static restore(input: AiCredentialReferenceInput): AiCredentialReference { return new AiCredentialReference(input); }
}
