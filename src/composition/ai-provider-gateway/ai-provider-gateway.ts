import "server-only";

import {getAiProviderRegistry} from "@/composition/ai-provider-registry/ai-provider-registry";
import {ExecuteAiProviderRequest} from "@/features/ai-provider-gateway/application/use-cases/execute-ai-provider-request";
import {AiProviderAdapterRegistry} from "@/features/ai-provider-gateway/infrastructure/adapters/ai-provider-adapter-registry";
import {GroqAiProviderAdapter} from "@/features/ai-provider-gateway/infrastructure/adapters/groq/groq-ai-provider-adapter";
import {PostgresAiRuntimeHealthRepository} from "@/features/ai-provider-gateway/infrastructure/persistence/postgres/repositories/postgres-ai-runtime-health-repository";
import {AiProviderRegistryCandidateSource} from "@/features/ai-provider-gateway/infrastructure/registry/ai-provider-registry-candidate-source";
import {NodeAiProviderGatewaySleeper} from "@/features/ai-provider-gateway/infrastructure/runtime/node-ai-provider-gateway-sleeper";
import {EnvironmentAiCredentialSecretResolver} from "@/features/ai-provider-gateway/infrastructure/security/environment-ai-credential-secret-resolver";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

const secretBindings = Object.freeze({
  "secret://ai/groq/primary": Object.freeze({
    environmentVariable: "GROQ_API_KEY",
    fileEnvironmentVariable: "GROQ_API_KEY_FILE",
  }),
});

function createAiProviderGateway(): ExecuteAiProviderRequest {
  const candidates = new AiProviderRegistryCandidateSource(getAiProviderRegistry().getEligibleProfiles);
  const secrets = new EnvironmentAiCredentialSecretResolver(secretBindings);
  const adapters = new AiProviderAdapterRegistry([new GroqAiProviderAdapter(secrets)]);
  const health = new PostgresAiRuntimeHealthRepository(getInquiryPostgresPool());
  return new ExecuteAiProviderRequest({
    candidates,
    adapters,
    health,
    clock: {now: () => new Date()},
    sleeper: new NodeAiProviderGatewaySleeper(),
  });
}

let gateway: ExecuteAiProviderRequest | undefined;
export function getAiProviderGateway(): ExecuteAiProviderRequest {
  return gateway ??= createAiProviderGateway();
}
