import type {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";

export type CreateConversationAccessResult =
  | Readonly<{status: "created"; credential: ConversationAccessCredential; token: string}>
  | Readonly<{status: "dependency_failed"}>;
