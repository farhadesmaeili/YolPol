import "server-only";

import {randomUUID} from "node:crypto";

import {getAiOperations} from "@/composition/ai-operations/ai-operations";
import {getAiProviderGateway} from "@/composition/ai-provider-gateway/ai-provider-gateway";
import {createConversationAiRouting, type ConversationAiRouting} from "@/composition/conversation-ai-routing/conversation-ai-routing-factory";
import {ChangeConversationAiControl} from "@/features/conversation-ai-routing/application/use-cases/change-conversation-ai-control";
import {GenerateBasicConversationAiResponse} from "@/features/conversation-ai-routing/application/use-cases/generate-basic-conversation-ai-response";
import {GetConversationAiStatus} from "@/features/conversation-ai-routing/application/use-cases/get-conversation-ai-status";
import {ProcessConversationAiFallbackJobs} from "@/features/conversation-ai-routing/application/use-cases/process-conversation-ai-fallback-jobs";
import {ScheduleCustomerAiFallback} from "@/features/conversation-ai-routing/application/use-cases/schedule-customer-ai-fallback";
import {PostgresConversationAiRoutingRepository} from "@/features/conversation-ai-routing/infrastructure/persistence/postgres/repositories/postgres-conversation-ai-routing-repository";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";
import {siteConfig} from "@/shared/config/site";

const safeUuid = () => randomUUID().replaceAll("-", "_");
const jobIds = {generate: () => `ai_job_${safeUuid()}`};
const leaseTokens = {generate: () => `lease_${safeUuid()}`};
const eventIds = {generate: () => `ai_control_${safeUuid()}`};
const clock = {now: () => new Date()};

export {createConversationAiRouting};
export type {ConversationAiRouting};

let routing: ConversationAiRouting | undefined;
export function getConversationAiRouting(): ConversationAiRouting {
  if (routing) return routing;
  const pool = getInquiryPostgresPool();
  const operations = getAiOperations();
  const repository = new PostgresConversationAiRoutingRepository(pool, leaseTokens, operations.evaluateAvailability);
  const authorization = new StaffAuthorizationPolicy();
  routing = Object.freeze({
    scheduler: new ScheduleCustomerAiFallback(operations.planFallback, jobIds),
    getStatus: new GetConversationAiStatus(repository, authorization),
    changeControl: new ChangeConversationAiControl(repository, authorization, eventIds, clock),
    worker: new ProcessConversationAiFallbackJobs(repository, operations.evaluateAvailability, new GenerateBasicConversationAiResponse(getAiProviderGateway(), siteConfig.identity.publicName), clock),
  });
  return routing;
}
