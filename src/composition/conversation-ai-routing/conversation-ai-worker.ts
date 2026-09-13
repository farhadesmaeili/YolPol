import type {Pool, PoolConfig} from "pg";

import {createConversationAiRouting} from "@/composition/conversation-ai-routing/conversation-ai-routing-factory";
import type {ProcessConversationAiFallbackJobs} from "@/features/conversation-ai-routing/application/use-cases/process-conversation-ai-fallback-jobs";
import {createPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {readPostgresConfig} from "@/features/inquiries/infrastructure/database/postgres-config";

export type ConversationAiWorkerRuntime = Readonly<{worker: Pick<ProcessConversationAiFallbackJobs, "execute">; close(): Promise<void>}>;
export type ConversationAiWorkerDependencies = Readonly<{readPostgresConfiguration(): PoolConfig; createPool(config: PoolConfig): Pool}>;

export function createConversationAiWorker(dependencies: ConversationAiWorkerDependencies = {
  readPostgresConfiguration: readPostgresConfig,
  createPool: createPostgresPool,
}): ConversationAiWorkerRuntime {
  const pool = dependencies.createPool(dependencies.readPostgresConfiguration());
  return Object.freeze({worker: createConversationAiRouting(pool).worker, close: () => pool.end()});
}
