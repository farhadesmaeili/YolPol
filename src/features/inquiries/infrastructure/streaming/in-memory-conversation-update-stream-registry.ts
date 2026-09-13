import type {ConversationMessageDto} from "@/features/inquiries/application/dto/conversation-message-dto";
import type {ConversationMessageUpdate, ConversationUpdateStreamRegistry} from "@/features/inquiries/application/ports/conversation-stream-ports";

type ActiveStream<TMessage extends ConversationMessageDto> = {
  cursor: number;
  readonly deliveredPositions: Set<number>;
  readonly conversationId: string;
  readonly listener: (update: ConversationMessageUpdate<TMessage>) => void;
};

export const defaultMaximumActiveConversationStreams = 100;
export const maximumRememberedConversationPositions = 1000;

export class InMemoryConversationUpdateStreamRegistry<TMessage extends ConversationMessageDto> implements ConversationUpdateStreamRegistry<TMessage> {
  private readonly activeStreams = new Map<number, ActiveStream<TMessage>>();
  private nextRegistrationId = 1;

  constructor(private readonly maximumActiveStreams = defaultMaximumActiveConversationStreams) {
    if (!Number.isSafeInteger(maximumActiveStreams) || maximumActiveStreams < 1) throw new RangeError("Maximum active streams must be a positive integer.");
  }

  register(input: Parameters<ConversationUpdateStreamRegistry["register"]>[0]) {
    if (this.activeStreams.size >= this.maximumActiveStreams) return null;
    const registrationId = this.nextRegistrationId++;
    this.activeStreams.set(registrationId, {conversationId: input.conversationId, cursor: input.afterCursor,
      deliveredPositions: new Set<number>(), listener: input.listener});
    let closed = false;

    return Object.freeze({
      publish: (updates: readonly ConversationMessageUpdate<TMessage>[]) => {
        if (closed) return;
        const stream = this.activeStreams.get(registrationId);
        if (!stream) return;
        const ordered = [...updates].sort((left, right) => left.cursor - right.cursor);
        try {
          for (const update of ordered) {
            if (update.cursor <= stream.cursor) continue;
            const resumeCursor = Math.max(stream.cursor, update.resumeCursor ?? update.cursor);
            if (resumeCursor === stream.cursor && stream.deliveredPositions.has(update.cursor)) continue;
            stream.listener(resumeCursor === update.cursor && update.resumeCursor === undefined
              ? update
              : Object.freeze({...update, resumeCursor}));
            stream.cursor = resumeCursor;
            for (const position of stream.deliveredPositions) {
              if (position <= stream.cursor) stream.deliveredPositions.delete(position);
            }
            if (update.cursor > stream.cursor) stream.deliveredPositions.add(update.cursor);
            // Eviction permits safe replay; it must never turn an unseen lower position into a duplicate.
            if (stream.deliveredPositions.size > maximumRememberedConversationPositions) {
              stream.deliveredPositions.delete(stream.deliveredPositions.values().next().value!);
            }
          }
        } catch (error) {
          closed = true;
          this.activeStreams.delete(registrationId);
          throw error;
        }
      },
      close: () => {
        if (closed) return;
        closed = true;
        this.activeStreams.delete(registrationId);
      },
    });
  }

  activeCount(): number {
    return this.activeStreams.size;
  }
}
