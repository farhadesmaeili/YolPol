import type {ConversationTranslationControlRepository} from "@/features/conversation-translation/application/ports/translation-control-ports";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

export class GetGlobalTranslationDefaults {
  constructor(private readonly repository: ConversationTranslationControlRepository, private readonly authorization: StaffAuthorization) {}

  async execute(principal: StaffPrincipal) {
    if (!this.authorization.mayViewTranslationSettings(principal)) return {status: "forbidden" as const};
    try {
      return {status: "found" as const, value: await this.repository.readGlobalDefaults()};
    } catch { return {status: "persistence_failed" as const}; }
  }
}
