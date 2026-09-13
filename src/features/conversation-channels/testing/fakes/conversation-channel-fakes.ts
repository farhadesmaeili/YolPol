import type {ConversationChannelOutboundAdapter} from "@/features/conversation-channels/application/ports/conversation-channel-ports";
import type {ConversationChannelSendTextResult} from "@/features/conversation-channels/domain/types/conversation-channel-types";

export class FakeConversationChannelOutboundAdapter implements ConversationChannelOutboundAdapter {
  readonly requests: Parameters<ConversationChannelOutboundAdapter["sendText"]>[0][] = [];
  result: ConversationChannelSendTextResult = Object.freeze({status: "DELIVERED", providerMessageReference: "provider-message-1"});
  failure: Error | null = null;

  async sendText(input: Parameters<ConversationChannelOutboundAdapter["sendText"]>[0]): Promise<ConversationChannelSendTextResult> {
    this.requests.push(input);
    if (this.failure) throw this.failure;
    return this.result;
  }
}
