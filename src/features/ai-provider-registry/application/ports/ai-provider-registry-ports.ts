import type {AiProviderRegistryEventDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import type {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import type {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import type {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";
import type {AiRegistryChangeType, AiRegistryEntityType} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

export class InvalidStoredAiProviderRegistryError extends Error {
  constructor() { super("Stored AI provider registry is invalid."); this.name = "InvalidStoredAiProviderRegistryError"; }
}

export type AiProviderRegistrySnapshot = Readonly<{providers: readonly AiProviderConfiguration[]; profiles: readonly AiModelProfile[]; credentialReferences: readonly AiCredentialReference[]}>;
export type AiProviderRegistryEntity = AiProviderConfiguration | AiModelProfile | AiCredentialReference;
export type AiProviderRegistryEvent = Readonly<{id: string; entityType: AiRegistryEntityType; entityId: string; changeType: AiRegistryChangeType; previousEntity: AiProviderRegistryEntity | null; newEntity: AiProviderRegistryEntity; actorReference: string; occurredAt: Date}>;
export type AiRegistrySaveResult = "saved" | "conflict" | "missing_parent" | "duplicate";

export interface AiProviderRegistryRepository {
  read(): Promise<AiProviderRegistrySnapshot>;
  findProvider(id: string): Promise<AiProviderConfiguration | null>;
  findProfile(id: string): Promise<AiModelProfile | null>;
  findCredentialReference(id: string): Promise<AiCredentialReference | null>;
  saveProvider(value: AiProviderConfiguration, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult>;
  saveProfile(value: AiModelProfile, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult>;
  saveCredentialReference(value: AiCredentialReference, event: AiProviderRegistryEvent, expectedVersion: number): Promise<AiRegistrySaveResult>;
  readEvents(limit: number): Promise<readonly AiProviderRegistryEventDto[]>;
}

export interface AiProviderRegistryClock { now(): Date; }
export interface AiProviderRegistryEventIdGenerator { generate(): string; }
