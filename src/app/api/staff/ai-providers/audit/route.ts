import {handleGetAiProviderRegistryAudit} from "@/composition/ai-provider-registry/ai-provider-registry-http";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const GET = handleGetAiProviderRegistryAudit;
