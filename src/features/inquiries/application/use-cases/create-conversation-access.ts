import type {ConversationAccessTokenService} from "@/features/inquiries/application/ports/conversation-access-ports";
import type {CreateConversationAccessResult} from "@/features/inquiries/application/results/create-conversation-access-result";
import {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";

export class CreateConversationAccess {
  constructor(private readonly tokens: ConversationAccessTokenService) {}

  execute(input: Readonly<{conversationId: string; createdAt: Date; expiresAt?: Date}>): CreateConversationAccessResult {
    try {
      const issued = this.tokens.issue();
      const credential = ConversationAccessCredential.create({
        conversationId: input.conversationId,
        tokenLookup: issued.lookup,
        tokenHash: issued.hash,
        createdAt: input.createdAt,
        expiresAt: input.expiresAt,
      });
      return {status: "created", credential, token: issued.token};
    } catch {
      return {status: "dependency_failed"};
    }
  }
}
