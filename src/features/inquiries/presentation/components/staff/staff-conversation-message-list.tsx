import {MessageTranslation, type TranslationLabels} from "@/features/conversation-translation/presentation/components/message-translation";
import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import {StaffDateTime} from "@/features/inquiries/presentation/components/staff/staff-ui";
import type {Locale} from "@/shared/types/locale";

export type StaffConversationLabels = Readonly<{
  translation?: TranslationLabels;
  aiAgent: string;
  customer: string;
  emptyDescription: string;
  emptyTitle: string;
  messageList: string;
  system: string;
  yolpolTeam: string;
  channels: Readonly<Record<StaffConversationMessageDto["channel"], string>>;
}>;

export function resolveStaffMessageAuthor(
  message: StaffConversationMessageDto,
  customerDisplayName: string,
  teamMemberNames: Readonly<Record<string, string>>,
  labels: Pick<StaffConversationLabels, "aiAgent" | "customer" | "system" | "yolpolTeam">,
): string {
  switch (message.senderType) {
    case "CUSTOMER": return customerDisplayName || labels.customer;
    case "AI_AGENT": return labels.aiAgent;
    case "SYSTEM": return labels.system;
    case "INTERNAL_USER": {
      const actorReference = message.actorReference;
      if (!actorReference?.startsWith("staff:")) return labels.yolpolTeam;
      const teamMemberId = actorReference.slice("staff:".length);
      return Object.prototype.hasOwnProperty.call(teamMemberNames, teamMemberId)
        ? teamMemberNames[teamMemberId] ?? labels.yolpolTeam
        : labels.yolpolTeam;
    }
  }
}

export function StaffConversationMessageList({
  customerDisplayName,
  inquiryId, canReply, onTranslationResolved,
  labels,
  locale,
  messages,
  teamMemberNames,
}: Readonly<{
  customerDisplayName: string;
  inquiryId?: string; canReply?: boolean; onTranslationResolved?: () => void;
  labels: StaffConversationLabels;
  locale: Locale;
  messages: readonly StaffConversationMessageDto[];
  teamMemberNames: Readonly<Record<string, string>>;
}>) {
  if (messages.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-7 text-center">
        <h3 className="text-sm font-bold text-stone-900">{labels.emptyTitle}</h3>
        <p className="mt-2 text-sm leading-6 text-stone-600">{labels.emptyDescription}</p>
      </div>
    );
  }

  return (
    <ol role="log" aria-live="polite" aria-relevant="additions" aria-label={labels.messageList} className="space-y-3">
      {messages.map((message) => (
        <li key={message.id} className="min-w-0 rounded-xl border border-stone-200 bg-stone-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="min-w-0 break-words font-bold text-stone-800">
              {resolveStaffMessageAuthor(message, customerDisplayName, teamMemberNames, labels)}
            </span>
            <span className="rounded-full bg-white px-2 py-1 text-stone-600">{labels.channels[message.channel]}</span>
          </div>
          {labels.translation && message.translation ? <p className="mt-3 text-xs font-semibold">{labels.translation.original} · {message.translation.sourceLocale ? labels.translation.languages[message.translation.sourceLocale] : labels.translation.unknown}</p> : null}
          <p dir="auto" className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-stone-800">{message.body}</p>
          {labels.translation && message.translation ? <MessageTranslation value={message.translation} labels={labels.translation} outbound={message.senderType !== "CUSTOMER"} canConfirmSource={message.senderType !== "SYSTEM"} inquiryId={inquiryId} messageId={message.id} canReply={canReply} onResolved={onTranslationResolved} /> : null}
          {labels.translation && !message.translation && (message.senderType === "INTERNAL_USER" || message.senderType === "AI_AGENT") ? <p className="mt-2 text-sm">{labels.translation.unknown}</p> : null}
          <p className="mt-3 text-xs text-stone-500"><StaffDateTime locale={locale} value={message.createdAt} /></p>
        </li>
      ))}
    </ol>
  );
}
