import "server-only";

import {ResolveConversationByAccessToken} from "@/features/inquiries/application/use-cases/resolve-conversation-by-access-token";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresConversationAccessRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-conversation-access-repository";
import {NodeConversationAccessTokenService} from "@/features/inquiries/infrastructure/security/conversation-access-token-service";

let resolver: ResolveConversationByAccessToken | undefined;

export function getConversationAccessResolver(): ResolveConversationByAccessToken {
  resolver ??= new ResolveConversationByAccessToken(
    new PostgresConversationAccessRepository(getInquiryPostgresPool()),
    new NodeConversationAccessTokenService(),
    {now: () => new Date()},
  );
  return resolver;
}
