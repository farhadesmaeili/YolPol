import type {EligibleAiModelProfileDto} from "@/features/ai-provider-registry/application/dto/ai-provider-registry-dto";
import type {AiProviderCapability} from "@/features/ai-provider-registry/domain/types/ai-provider-registry-types";
import type {AiProviderCandidateSource, AiProviderExecutionCandidate} from "@/features/ai-provider-gateway/application/ports/ai-provider-gateway-ports";

type EligibilityReader = Readonly<{
  execute(capability: unknown): Promise<readonly EligibleAiModelProfileDto[]>;
}>;

export class AiProviderRegistryCandidateSource implements AiProviderCandidateSource {
  constructor(private readonly eligibility: EligibilityReader) {}

  async getEligibleCandidates(capabilities: readonly AiProviderCapability[]): Promise<readonly AiProviderExecutionCandidate[]> {
    const [primary] = capabilities;
    if (!primary) return Object.freeze([]);
    const eligible = await this.eligibility.execute(primary);
    return Object.freeze(eligible.filter(({profile}) => capabilities.every((capability) => profile.capabilities.includes(capability))).map(({provider, profile, credentialReferences}) => Object.freeze({
      providerConfigurationId: provider.id,
      modelProfileId: profile.id,
      adapterKey: provider.adapterKey,
      providerModelIdentifier: profile.modelIdentifier,
      generationSettings: profile.generationSettings,
      credentialReferences: Object.freeze(credentialReferences.map(({id, credentialReference}) => Object.freeze({id, credentialReference}))),
    })));
  }
}
