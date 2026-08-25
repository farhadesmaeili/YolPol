export type ConversationUpdateStreamSession = Readonly<{
  close(): void;
  completed: Promise<void>;
}>;

export type StreamConversationUpdatesResult =
  | Readonly<{status: "opened"; session: ConversationUpdateStreamSession}>
  | Readonly<{status: "capacity_exceeded"}>
  | Readonly<{status: "validation_failed"}>;
