import "server-only";
import {randomUUID} from "node:crypto";
import {ChangeConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/change-conversation-translation-control";
import {GetConversationTranslationControl} from "@/features/conversation-translation/application/use-cases/get-conversation-translation-control";
import {PostgresConversationTranslationControlRepository} from "@/features/conversation-translation/infrastructure/persistence/postgres-translation-control-repository";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

export type ConversationTranslationControlComposition = Readonly<{
  get: GetConversationTranslationControl;
  change: ChangeConversationTranslationControl;
}>;

let composition: ConversationTranslationControlComposition | undefined;
export function getConversationTranslationControl(): ConversationTranslationControlComposition {
  if (composition) return composition;
  const repository = new PostgresConversationTranslationControlRepository(getInquiryPostgresPool());
  const authorization = new StaffAuthorizationPolicy();
  composition = Object.freeze({
    get: new GetConversationTranslationControl(repository, authorization),
    change: new ChangeConversationTranslationControl(
      repository,
      authorization,
      {generate: () => `translation_control_${randomUUID().replaceAll("-", "_")}`},
      {now: () => new Date()},
    ),
  });
  return composition;
}
