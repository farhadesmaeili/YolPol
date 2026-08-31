import {handleGetAiOperationsAudit} from "@/composition/ai-operations/ai-operations-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = handleGetAiOperationsAudit;
