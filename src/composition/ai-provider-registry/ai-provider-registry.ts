import "server-only";

import {createAiProviderRegistry, type AiProviderRegistry} from "@/composition/ai-provider-registry/ai-provider-registry-factory";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export {createAiProviderRegistry};
export type {AiProviderRegistry};

let registry: AiProviderRegistry | undefined;
export function getAiProviderRegistry(): AiProviderRegistry { return registry ??= createAiProviderRegistry(getInquiryPostgresPool()); }
