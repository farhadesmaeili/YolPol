import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";
import type {AiProviderRegistryDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import {toAiCredentialReferenceDto, toAiModelProfileDto, toAiProviderConfigurationDto} from "@/features/ai-provider-registry/application/mappers/ai-provider-registry-dto-mapper";
import type {AiProviderRegistryRepository} from "@/features/ai-provider-registry/application/ports/ai-provider-registry-ports";
import {compareAiRegistryPriority} from "@/features/ai-provider-registry/domain/services/order-ai-provider-registry";

export class GetAiProviderRegistry {
  constructor(private readonly repository: AiProviderRegistryRepository, private readonly authorization: StaffAuthorization) {}
  async execute(principal: StaffPrincipal): Promise<Readonly<{status: "found"; registry: AiProviderRegistryDto}> | Readonly<{status: "forbidden" | "unavailable"}>> {
    if (!this.authorization.mayViewAiProviderRegistry(principal)) return {status: "forbidden"};
    try {
      const value = await this.repository.read();
      return {status: "found", registry: Object.freeze({
        providers: Object.freeze([...value.providers].sort(compareAiRegistryPriority).map(toAiProviderConfigurationDto)),
        profiles: Object.freeze([...value.profiles].sort(compareAiRegistryPriority).map(toAiModelProfileDto)),
        credentialReferences: Object.freeze([...value.credentialReferences].sort(compareAiRegistryPriority).map(toAiCredentialReferenceDto)),
      })};
    } catch { return {status: "unavailable"}; }
  }
}
