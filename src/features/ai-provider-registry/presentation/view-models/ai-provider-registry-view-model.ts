import type {AiProviderRegistryDto, AiProviderRegistryEventDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
export type AiProviderRegistryViewModel = Readonly<{registry: AiProviderRegistryDto; events: readonly AiProviderRegistryEventDto[]; mayManageProviders: boolean; mayManageCredentialReferences: boolean}>;
