import type {ChangeConversationTranslationControlInput} from "@/features/conversation-translation/application/dto/translation-control-dto";
import type {ConversationTranslationControlRepository, TranslationControlClock, TranslationControlEventIdGenerator} from "@/features/conversation-translation/application/ports/translation-control-ports";
import {aiToStaffTranslationModes, customerToStaffTranslationModes, staffToCustomerTranslationModes, type AiToStaffTranslationMode, type CustomerToStaffTranslationMode, type StaffToCustomerTranslationMode} from "@/features/conversation-translation/domain/types/translation-control";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffAuthorization} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

export class ChangeConversationTranslationControl {
  constructor(
    private readonly repository: ConversationTranslationControlRepository,
    private readonly authorization: StaffAuthorization,
    private readonly eventIds: TranslationControlEventIdGenerator,
    private readonly clock: TranslationControlClock,
  ) {}

  async execute(input: ChangeConversationTranslationControlInput & Readonly<{principal: StaffPrincipal}>) {
    if (!this.authorization.mayReplyToCustomerConversation(input.principal)) return {status: "forbidden" as const};
    if (!/^[A-Za-z0-9_-]{1,160}$/u.test(input.inquiryId)) return {status: "validation_failed" as const, field: "inquiryId" as const};
    if (!(customerToStaffTranslationModes as readonly unknown[]).includes(input.customerToStaffMode)) return {status: "validation_failed" as const, field: "customerToStaffMode" as const};
    if (!(staffToCustomerTranslationModes as readonly unknown[]).includes(input.staffToCustomerMode)) return {status: "validation_failed" as const, field: "staffToCustomerMode" as const};
    if (!(aiToStaffTranslationModes as readonly unknown[]).includes(input.aiToStaffMode)) return {status: "validation_failed" as const, field: "aiToStaffMode" as const};
    if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) return {status: "validation_failed" as const, field: "expectedVersion" as const};
    try {
      const result = await this.repository.change({
        inquiryId: input.inquiryId,
        customerToStaffMode: input.customerToStaffMode as CustomerToStaffTranslationMode,
        staffToCustomerMode: input.staffToCustomerMode as StaffToCustomerTranslationMode,
        aiToStaffMode: input.aiToStaffMode as AiToStaffTranslationMode,
        expectedVersion: Number(input.expectedVersion),
        actorReference: this.authorization.actorReferenceFor(input.principal),
        eventId: this.eventIds.generate(),
        now: this.clock.now(),
      });
      return result === "updated" || result === "unchanged"
        ? {status: "updated" as const, unchanged: result === "unchanged"}
        : {status: result as "not_found" | "conflict"};
    } catch { return {status: "persistence_failed" as const}; }
  }
}
