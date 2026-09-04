import "server-only";

import {createAiProviderGateway} from "@/composition/ai-provider-gateway/ai-provider-gateway-factory";
import {getAiProviderRegistry} from "@/composition/ai-provider-registry/ai-provider-registry";
import type {ExecuteAiProviderRequest} from "@/features/ai-provider-gateway/application/use-cases/execute-ai-provider-request";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export {createAiProviderGateway};

let gateway: ExecuteAiProviderRequest | undefined;
export function getAiProviderGateway(): ExecuteAiProviderRequest {
  if (gateway) return gateway;
  const pool = getInquiryPostgresPool();
  gateway = createAiProviderGateway(pool, getAiProviderRegistry());
  return gateway;
}
