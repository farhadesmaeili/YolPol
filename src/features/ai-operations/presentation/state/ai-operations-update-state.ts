import type {AiOperationsUpdateResponse} from "@/features/ai-operations/presentation/clients/ai-operations-client";

export type AiOperationsUpdateNotice = "saved" | "invalid" | "conflict" | "forbidden" | "rate_limited" | "failed";

export function presentAiOperationsUpdate(result: AiOperationsUpdateResponse): Readonly<{notice: AiOperationsUpdateNotice; refresh: boolean}> {
  return result.status === "updated" ? {notice: "saved", refresh: true} : {notice: result.status, refresh: false};
}
