import {ConversationTranslationControlValidationError} from "@/features/conversation-translation/domain/errors/translation-control-errors";
import {
  aiToStaffTranslationModes,
  customerToStaffTranslationModes,
  staffToCustomerTranslationModes,
  type AiToStaffTranslationMode,
  type CustomerToStaffTranslationMode,
  type StaffToCustomerTranslationMode,
} from "@/features/conversation-translation/domain/types/translation-control";

const identityPattern = /^[A-Za-z0-9_-]{1,128}$/u;
const actorPattern = /^staff:[A-Za-z0-9_-]{1,160}$/u;

export class ConversationTranslationControl {
  private constructor(
    readonly conversationId: string,
    readonly customerToStaffMode: CustomerToStaffTranslationMode,
    readonly staffToCustomerMode: StaffToCustomerTranslationMode,
    readonly aiToStaffMode: AiToStaffTranslationMode,
    readonly version: number,
    readonly updatedAt: Date,
    readonly updatedBy: string,
  ) { Object.freeze(this); }

  static restore(input: Readonly<{
    conversationId: string;
    customerToStaffMode: string;
    staffToCustomerMode: string;
    aiToStaffMode: string;
    version: number;
    updatedAt: Date;
    updatedBy: string;
  }>): ConversationTranslationControl {
    if (!identityPattern.test(input.conversationId)) throw new ConversationTranslationControlValidationError("conversationId", "Conversation ID is invalid.");
    if (!(customerToStaffTranslationModes as readonly string[]).includes(input.customerToStaffMode)) throw new ConversationTranslationControlValidationError("customerToStaffMode", "Customer to Staff translation mode is invalid.");
    if (!(staffToCustomerTranslationModes as readonly string[]).includes(input.staffToCustomerMode)) throw new ConversationTranslationControlValidationError("staffToCustomerMode", "Staff to Customer translation mode is invalid.");
    if (!(aiToStaffTranslationModes as readonly string[]).includes(input.aiToStaffMode)) throw new ConversationTranslationControlValidationError("aiToStaffMode", "AI to Staff translation mode is invalid.");
    if (!Number.isSafeInteger(input.version) || input.version < 1) throw new ConversationTranslationControlValidationError("version", "Translation control version is invalid.");
    if (!(input.updatedAt instanceof Date) || !Number.isFinite(input.updatedAt.getTime())) throw new ConversationTranslationControlValidationError("updatedAt", "Translation control update time is invalid.");
    if (!actorPattern.test(input.updatedBy)) throw new ConversationTranslationControlValidationError("updatedBy", "Translation control actor is invalid.");
    return new ConversationTranslationControl(
      input.conversationId,
      input.customerToStaffMode as CustomerToStaffTranslationMode,
      input.staffToCustomerMode as StaffToCustomerTranslationMode,
      input.aiToStaffMode as AiToStaffTranslationMode,
      input.version,
      new Date(input.updatedAt),
      input.updatedBy,
    );
  }
}
