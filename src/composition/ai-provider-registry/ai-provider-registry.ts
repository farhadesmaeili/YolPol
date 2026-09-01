import "server-only";

import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {GetAiProviderRegistry} from "@/features/ai-provider-registry/application/use-cases/get-ai-provider-registry";
import {GetEligibleAiModelProfiles} from "@/features/ai-provider-registry/application/use-cases/get-eligible-ai-model-profiles";
import {ReadAiProviderRegistryAuditHistory} from "@/features/ai-provider-registry/application/use-cases/read-ai-provider-registry-audit-history";
import {SaveAiCredentialReference, SaveAiModelProfile, SaveAiProviderConfiguration} from "@/features/ai-provider-registry/application/use-cases/save-ai-provider-registry-entities";
import {PostgresAiProviderRegistryRepository} from "@/features/ai-provider-registry/infrastructure/persistence/postgres/repositories/postgres-ai-provider-registry-repository";
import {NodeAiProviderRegistryEventIdGenerator} from "@/features/ai-provider-registry/infrastructure/security/node-ai-provider-registry-event-id-generator";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export type AiProviderRegistry = ReturnType<typeof createAiProviderRegistry>;
function createAiProviderRegistry() {
  const repository = new PostgresAiProviderRegistryRepository(getInquiryPostgresPool()); const authorization = getStaffAuthentication().authorization;
  const context = Object.freeze({repository, authorization, clock: {now: () => new Date()}, eventIds: new NodeAiProviderRegistryEventIdGenerator()});
  return Object.freeze({getRegistry: new GetAiProviderRegistry(repository, authorization), getEligibleProfiles: new GetEligibleAiModelProfiles(repository), readAuditHistory: new ReadAiProviderRegistryAuditHistory(repository, authorization), saveProvider: new SaveAiProviderConfiguration(context), saveProfile: new SaveAiModelProfile(context), saveCredentialReference: new SaveAiCredentialReference(context)});
}
let registry: AiProviderRegistry | undefined;
export function getAiProviderRegistry(): AiProviderRegistry { return registry ??= createAiProviderRegistry(); }
