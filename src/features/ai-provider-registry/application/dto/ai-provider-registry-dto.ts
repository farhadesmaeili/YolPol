import type {AiGenerationSettings, AiProviderCapability, AiRegistryChangeType, AiRegistryEntityType} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

export type AiProviderConfigurationDto = Readonly<{id: string; adapterKey: string; displayName: string; enabled: boolean; priority: number; version: number; createdAt: string; updatedAt: string; updatedBy: string}>;
export type AiModelProfileDto = Readonly<{id: string; providerId: string; name: string; modelIdentifier: string; enabled: boolean; priority: number; capabilities: readonly AiProviderCapability[]; generationSettings: AiGenerationSettings; version: number; createdAt: string; updatedAt: string; updatedBy: string}>;
export type AiCredentialReferenceDto = Readonly<{id: string; providerId: string; alias: string; credentialReference: string; enabled: boolean; priority: number; version: number; createdAt: string; updatedAt: string; updatedBy: string}>;

export type AiProviderRegistryDto = Readonly<{providers: readonly AiProviderConfigurationDto[]; profiles: readonly AiModelProfileDto[]; credentialReferences: readonly AiCredentialReferenceDto[]}>;
export type AiRegistryAuditSnapshot = AiProviderConfigurationDto | AiModelProfileDto | AiCredentialReferenceDto;
export type AiProviderRegistryEventDto = Readonly<{id: string; entityType: AiRegistryEntityType; entityId: string; changeType: AiRegistryChangeType; previousVersion: number | null; newVersion: number; actorReference: string; occurredAt: string; previousSnapshot: AiRegistryAuditSnapshot | null; newSnapshot: AiRegistryAuditSnapshot}>;

export type EligibleAiModelProfileDto = Readonly<{provider: AiProviderConfigurationDto; profile: AiModelProfileDto; credentialReferences: readonly AiCredentialReferenceDto[]}>;
