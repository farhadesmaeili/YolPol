import {randomUUID} from "node:crypto";
import type {Pool} from "pg";

import {createAiOperations} from "@/composition/ai-operations/ai-operations-factory";
import {createAiProviderGateway} from "@/composition/ai-provider-gateway/ai-provider-gateway-factory";
import {ChangeConversationAiControl} from "@/features/conversation-ai-routing/application/use-cases/change-conversation-ai-control";
import {GenerateBasicConversationAiResponse} from "@/features/conversation-ai-routing/application/use-cases/generate-basic-conversation-ai-response";
import {GetConversationAiStatus} from "@/features/conversation-ai-routing/application/use-cases/get-conversation-ai-status";
import {ProcessConversationAiFallbackJobs} from "@/features/conversation-ai-routing/application/use-cases/process-conversation-ai-fallback-jobs";
import {ScheduleCustomerAiFallback} from "@/features/conversation-ai-routing/application/use-cases/schedule-customer-ai-fallback";
import {PostgresConversationAiRoutingRepository} from "@/features/conversation-ai-routing/infrastructure/persistence/postgres/repositories/postgres-conversation-ai-routing-repository";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {siteConfig} from "@/shared/config/site";

const safeUuid = () => randomUUID().replaceAll("-", "_");
const jobIds = {generate: () => `ai_job_${safeUuid()}`};
const leaseTokens = {generate: () => `lease_${safeUuid()}`};
const eventIds = {generate: () => `ai_control_${safeUuid()}`};
const clock = {now: () => new Date()};

export type ConversationAiRouting = ReturnType<typeof createConversationAiRouting>;

export function createConversationAiRouting(pool: Pool) {
  const operations = createAiOperations(pool);
  const repository = new PostgresConversationAiRoutingRepository(pool, leaseTokens, operations.evaluateAvailability);
  const authorization = new StaffAuthorizationPolicy();
  return Object.freeze({
    scheduler: new ScheduleCustomerAiFallback(operations.planFallback, jobIds),
    getStatus: new GetConversationAiStatus(repository, authorization),
    changeControl: new ChangeConversationAiControl(repository, authorization, eventIds, clock),
    worker: new ProcessConversationAiFallbackJobs(
      repository,
      operations.evaluateAvailability,
      new GenerateBasicConversationAiResponse(createAiProviderGateway(pool), siteConfig.identity.publicName),
      clock,
    ),
  });
}
