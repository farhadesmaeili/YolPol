import type {ConversationAiStatusDto} from "@/features/conversation-ai-routing/application/dto/conversation-ai-routing-dto";
import type {ConversationAiControlState} from "@/features/conversation-ai-routing/domain/types/conversation-ai-routing-types";

export async function updateConversationAiControl(input: Readonly<{inquiryId: string; state: ConversationAiControlState; expectedVersion: number}>, fetcher: typeof fetch = fetch): Promise<ConversationAiStatusDto> {
  const response = await fetcher(`/api/staff/inquiries/${encodeURIComponent(input.inquiryId)}/ai-control`, {
    method: "PUT",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({state: input.state, expectedVersion: input.expectedVersion}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || typeof payload !== "object" || payload === null || !("value" in payload)) throw new Error("conversation_ai_control_failed");
  return (payload as {value: ConversationAiStatusDto}).value;
}
