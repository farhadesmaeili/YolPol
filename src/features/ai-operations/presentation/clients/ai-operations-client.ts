import type {AiOperationsPolicyDto} from "@/features/ai-operations/application/dto/ai-operations-dto";
import type {AiOperationsMode, AiScheduleWindow} from "@/features/ai-operations/domain/types/ai-operations-types";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AiOperationsUpdateInput = Readonly<{
  expectedVersion: number;
  mode: AiOperationsMode;
  businessTimeZone: string;
  humanGracePeriodSeconds: number;
  scheduleWindows: readonly AiScheduleWindow[];
}>;

export type AiOperationsUpdateResponse = Readonly<{status: "updated"; policy: AiOperationsPolicyDto}>
  | Readonly<{status: "conflict" | "invalid" | "forbidden" | "rate_limited" | "failed"}>;

export async function updateAiOperationsPolicy(fetcher: Fetcher, input: AiOperationsUpdateInput): Promise<AiOperationsUpdateResponse> {
  try {
    const response = await fetcher("/api/staff/ai-operations", {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(input),
    });
    if (response.ok) {
      const body = await response.json() as unknown;
      if (typeof body === "object" && body !== null && !Array.isArray(body)) {
        const record = body as Record<string, unknown>;
        if (record.status === "updated" && typeof record.policy === "object" && record.policy !== null) {
          return {status: "updated", policy: record.policy as AiOperationsPolicyDto};
        }
      }
      return {status: "failed"};
    }
    if (response.status === 409) return {status: "conflict"};
    if (response.status === 400 || response.status === 413 || response.status === 415) return {status: "invalid"};
    if (response.status === 403) return {status: "forbidden"};
    if (response.status === 429) return {status: "rate_limited"};
    return {status: "failed"};
  } catch { return {status: "failed"}; }
}
