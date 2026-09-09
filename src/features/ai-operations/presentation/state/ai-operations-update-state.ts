import type {AiOperationsUpdateResponse} from "@/features/ai-operations/presentation/clients/ai-operations-client";

export type AiOperationsUpdateNotice = "saved" | "invalid" | "conflict" | "forbidden" | "rate_limited" | "failed";

export type AiOperationsUpdatePresentation = Readonly<{notice: "saved"; refresh: true}>
  | Readonly<{notice: Exclude<AiOperationsUpdateNotice, "saved">; refresh: false}>;

export function presentAiOperationsUpdate(result: AiOperationsUpdateResponse): AiOperationsUpdatePresentation {
  return result.status === "updated" ? {notice: "saved", refresh: true} : {notice: result.status, refresh: false};
}
