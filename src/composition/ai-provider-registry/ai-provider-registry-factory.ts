import type {Pool} from "pg";

import {GetAiProviderRegistry} from "@/features/ai-provider-registry/application/use-cases/get-ai-provider-registry";
import {GetEligibleAiModelProfiles} from "@/features/ai-provider-registry/application/use-cases/get-eligible-ai-model-profiles";
import {ReadAiProviderRegistryAuditHistory} from "@/features/ai-provider-registry/application/use-cases/read-ai-provider-registry-audit-history";
import {SaveAiCredentialReference, SaveAiModelProfile, SaveAiProviderConfiguration} from "@/features/ai-provider-registry/application/use-cases/save-ai-provider-registry-entities";
import {PostgresAiProviderRegistryRepository} from "@/features/ai-provider-registry/infrastructure/persistence/postgres/repositories/postgres-ai-provider-registry-repository";
import {NodeAiProviderRegistryEventIdGenerator} from "@/features/ai-provider-registry/infrastructure/security/node-ai-provider-registry-event-id-generator";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

export type AiProviderRegistry = ReturnType<typeof createAiProviderRegistry>;

export function createAiProviderRegistry(pool: Pool) {
  const repository = new PostgresAiProviderRegistryRepository(pool);
  const authorization = new StaffAuthorizationPolicy();
  const context = Object.freeze({repository, authorization, clock: {now: () => new Date()}, eventIds: new NodeAiProviderRegistryEventIdGenerator()});
  return Object.freeze({getRegistry: new GetAiProviderRegistry(repository, authorization), getEligibleProfiles: new GetEligibleAiModelProfiles(repository), readAuditHistory: new ReadAiProviderRegistryAuditHistory(repository, authorization), saveProvider: new SaveAiProviderConfiguration(context), saveProfile: new SaveAiModelProfile(context), saveCredentialReference: new SaveAiCredentialReference(context)});
}
