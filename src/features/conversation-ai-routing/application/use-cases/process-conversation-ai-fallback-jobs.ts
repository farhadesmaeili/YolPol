import {maximumAiFallbackSchedulingHorizonMs} from "@/features/ai-operations/application/use-cases/plan-ai-operations-fallback";
import type {AiOperationsAvailabilityEvaluator, ConversationAiClock, ConversationAiResponseGenerator, ConversationAiRoutingRepository} from "@/features/conversation-ai-routing/application/ports/conversation-ai-routing-ports";
import {ConversationAiGenerationError} from "@/features/conversation-ai-routing/domain/errors/conversation-ai-routing-errors";
import type {ConversationAiFailureCategory} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export type ProcessConversationAiFallbackJobsResult = Readonly<{claimed: number; succeeded: number; cancelled: number; superseded: number; failed: number}>;

export class ProcessConversationAiFallbackJobs {
  constructor(
    private readonly repository: ConversationAiRoutingRepository,
    private readonly operations: AiOperationsAvailabilityEvaluator,
    private readonly generator: ConversationAiResponseGenerator,
    private readonly clock: ConversationAiClock,
    private readonly batchSize = 10,
  ) {}

  async execute(): Promise<ProcessConversationAiFallbackJobsResult> {
    const jobs = await this.repository.claimDue({limit: this.batchSize, now: this.clock.now(), leaseMilliseconds: 60_000});
    const counts = {claimed: jobs.length, succeeded: 0, cancelled: 0, superseded: 0, failed: 0};
    for (const job of jobs) {
      const before = await this.operations.execute();
      if (!before.allowed) {
        await this.repository.cancel({job, now: this.clock.now()});
        counts.cancelled += 1;
        continue;
      }
      const prepared = await this.repository.prepare({job, now: this.clock.now(), maximumAgeMilliseconds: maximumAiFallbackSchedulingHorizonMs});
      if (prepared.status !== "eligible") {
        if (prepared.status === "superseded") counts.superseded += 1;
        else if (prepared.status === "cancelled") counts.cancelled += 1;
        continue;
      }
      try {
        const response = await this.generator.generate({executionId: job.executionId, messages: prepared.messages});
        const final = await this.repository.finalize({job, body: response.content, now: this.clock.now()});
        if (final === "succeeded") counts.succeeded += 1;
        else if (final === "superseded") counts.superseded += 1;
        else if (final === "cancelled") counts.cancelled += 1;
      } catch (error) {
        const category = (error instanceof ConversationAiGenerationError ? error.category : "INFRASTRUCTURE_FAILURE") as ConversationAiFailureCategory;
        await this.repository.fail({job, category, now: this.clock.now()});
        counts.failed += 1;
      }
    }
    return Object.freeze(counts);
  }
}
