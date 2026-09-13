import type {EligibleAiModelProfileDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import {toAiCredentialReferenceDto, toAiModelProfileDto, toAiProviderConfigurationDto} from "@/features/ai-provider-registry/application/mappers/ai-provider-registry-dto-mapper";
import type {AiProviderRegistryRepository} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";
import {compareAiRegistryPriority} from "@/features/ai-provider-registry/domain/services/order-ai-provider-registry";
import {aiProviderCapabilities, type AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";

export class GetEligibleAiModelProfiles {
  constructor(private readonly repository: AiProviderRegistryRepository) {}
  async execute(capability: unknown): Promise<readonly EligibleAiModelProfileDto[]> {
    if (typeof capability !== "string" || !(aiProviderCapabilities as readonly string[]).includes(capability)) return Object.freeze([]);
    const registry = await this.repository.read();
    const providers = new Map(registry.providers.filter((item) => item.enabled).map((item) => [item.id, item]));
    const credentials = new Map<string, typeof registry.credentialReferences>();
    for (const provider of providers.values()) credentials.set(provider.id, Object.freeze(registry.credentialReferences.filter((item) => item.providerId === provider.id && item.enabled).sort(compareAiRegistryPriority)));
    return Object.freeze(registry.profiles
      .filter((profile) => profile.enabled && profile.capabilities.includes(capability as AiProviderCapability) && providers.has(profile.providerId) && (credentials.get(profile.providerId)?.length ?? 0) > 0)
      .sort((left, right) => compareAiRegistryPriority(providers.get(left.providerId)!, providers.get(right.providerId)!) || compareAiRegistryPriority(left, right))
      .map((profile) => Object.freeze({provider: toAiProviderConfigurationDto(providers.get(profile.providerId)!), profile: toAiModelProfileDto(profile), credentialReferences: Object.freeze(credentials.get(profile.providerId)!.map(toAiCredentialReferenceDto))})));
  }
}
