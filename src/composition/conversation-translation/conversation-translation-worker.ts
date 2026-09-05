import type {Pool} from "pg";
import {createAiProviderGateway} from "@/composition/ai-provider-gateway/ai-provider-gateway-factory";
import {ProcessTranslationJobs} from "@/features/conversation-translation/application/use-cases/process-translation-jobs";
import {PostgresTranslationJobRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-job-repository";
import {EnvironmentAiOperationsEmergencyOverride} from "@/features/ai-operations/infrastructure/config/environment-ai-operations-emergency-override";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";

export function createConversationTranslationWorker(createPool: () => Pool = () => createPostgresPool(readPostgresConfig())) {
  const pool = createPool();
  return {worker: new ProcessTranslationJobs(new PostgresTranslationJobRepository(pool), createAiProviderGateway(pool),
    new EnvironmentAiOperationsEmergencyOverride(), {now: () => new Date()}), close: () => pool.end()};
}
