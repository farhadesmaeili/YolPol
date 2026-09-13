import type {ConversationAccessCredential} from "@/features/inquiries/domain/entities/conversation-access-credential";

export type IssuedConversationAccessToken = Readonly<{token: string; lookup: string; hash: string}>;
export type PresentedConversationAccessToken = Readonly<{lookup: string; hash: string}>;
export type StoredConversationAccess = Readonly<{credential: ConversationAccessCredential; inquiryId: string}>;

export interface ConversationAccessTokenService {
  issue(): IssuedConversationAccessToken;
  inspect(token: string): PresentedConversationAccessToken | null;
  hashesMatch(actualHash: string, expectedHash: string): boolean;
}

export interface ConversationAccessRepository {
  findByLookup(lookup: string): Promise<StoredConversationAccess | null>;
}
