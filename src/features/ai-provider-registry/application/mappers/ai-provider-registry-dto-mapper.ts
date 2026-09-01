import type {AiCredentialReferenceDto, AiModelProfileDto, AiProviderConfigurationDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import type {AiCredentialReference} from "@/features/ai-provider-registry/domain/entities/ai-credential-reference";
import type {AiModelProfile} from "@/features/ai-provider-registry/domain/entities/ai-model-profile";
import type {AiProviderConfiguration} from "@/features/ai-provider-registry/domain/entities/ai-provider-configuration";

export const toAiProviderConfigurationDto = (value: AiProviderConfiguration): AiProviderConfigurationDto => Object.freeze({...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString()});
export const toAiModelProfileDto = (value: AiModelProfile): AiModelProfileDto => Object.freeze({...value, capabilities: Object.freeze([...value.capabilities]), generationSettings: Object.freeze({...value.generationSettings}), createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString()});
export const toAiCredentialReferenceDto = (value: AiCredentialReference): AiCredentialReferenceDto => Object.freeze({...value, createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString()});
