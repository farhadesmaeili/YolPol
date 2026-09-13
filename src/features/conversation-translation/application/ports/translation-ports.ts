import type {AiProviderExecutionRequest, AiProviderExecutionResult} from "@/features/ai-provider-gateway/domain/types/ai-provider-execution";
import type {TranslationFailure, TranslationJob} from "@/features/conversation-translation/domain/types/translation";

export interface TranslationGateway { execute(request: AiProviderExecutionRequest & Readonly<{signal?: AbortSignal}>): Promise<AiProviderExecutionResult>; }
export interface TranslationJobRepository {
  claim(now: Date): Promise<TranslationJob | null>;
  withExecutionLock(job: TranslationJob, now: Date, work: (source: string, executionBudgetMs: number) => Promise<void>): Promise<boolean>;
  finish(job: TranslationJob, result: Readonly<{body: string}> | Readonly<{failure: TranslationFailure}>, now: Date): Promise<boolean>;
}
