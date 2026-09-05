import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import {MessageTranslation} from "@/features/conversation-translation/presentation/components/message-translation";
import {StaffConversationMessageList} from "@/features/inquiries/presentation/components/staff/staff-conversation-message-list";
import {parseMessageTranslation} from "@/features/conversation-translation/presentation/clients/parse-message-translation";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import ar from "@/i18n/messages/ar.json";
import tr from "@/i18n/messages/tr.json";

describe("Staff translation presentation", () => {
  it("shows localized blockers and authorized remedies, with no Viewer controls", () => {
    for (const catalog of [en, fa, ar, tr]) {
      const value = {sourceLocale: "fa" as const, customerTargetLocale: "tr" as const, deliveryState: "ACTIVE" as const, version: 2,
        translations: [{targetLocale: "tr" as const, status: "FAILED" as const, body: null}]};
      const render = (canReply: boolean) => renderToStaticMarkup(<MessageTranslation value={value} labels={catalog.Staff.translation} inquiryId="inquiry" messageId="message" canReply={canReply} />);
      expect(render(true)).toContain(catalog.Staff.translation.blocked);
      expect(render(true)).toContain(catalog.Staff.translation.retry);
      expect(render(true)).toContain(catalog.Staff.translation.skip);
      expect(render(false)).not.toContain("<button");
      expect(render(false)).toContain(catalog.Staff.translation.blocked);
      expect(parseMessageTranslation(value)).toEqual(value);
      const skipped = renderToStaticMarkup(<MessageTranslation value={{...value, deliveryState: "SKIPPED"}} labels={catalog.Staff.translation} inquiryId="inquiry" messageId="message" canReply />);
      expect(skipped).toContain(catalog.Staff.translation.skipped); expect(skipped).not.toContain("<button");
      const unknown = renderToStaticMarkup(<MessageTranslation value={{...value, sourceLocale: null, translations: []}} labels={catalog.Staff.translation} inquiryId="inquiry" messageId="message" canReply />);
      expect(unknown).toContain(catalog.Staff.translation.confirmLanguage); expect(unknown).toContain("<select");
    }
  });
  it("retains original with translation and four localized status catalogs", () => {
    for (const catalog of [en, fa, ar, tr]) for (const status of ["PENDING", "FAILED", "SUCCEEDED"] as const) {
      const value = {sourceLocale: "tr" as const, customerTargetLocale: null, translations: [{targetLocale: "fa" as const, status, body: status === "SUCCEEDED" ? "Translated message" : null}]};
      const markup = renderToStaticMarkup(<StaffConversationMessageList locale="en" customerDisplayName="Customer" teamMemberNames={{}}
        labels={{translation: catalog.Staff.translation, aiAgent: "AI", customer: "Customer", system: "System", yolpolTeam: "Team", emptyDescription: "Empty", emptyTitle: "Empty", messageList: "Messages", channels: catalog.Staff.channels}}
        messages={[{id: "message", senderType: "CUSTOMER", channel: "WEBSITE", actorReference: null, body: "Original message", createdAt: "2026-09-05T00:00:00Z", translation: value}]} />);
      expect(markup).toContain("Original message");
      expect(markup).toContain(status === "PENDING" ? catalog.Staff.translation.pending : status === "FAILED" ? catalog.Staff.translation.failed : "Translated message");
      if (status === "SUCCEEDED") expect(markup).toContain('lang="fa" dir="rtl"');
      expect(parseMessageTranslation(value)).toEqual(value);
    }
  });
  it("uses LTR for Turkish, makes readiness precise and rejects provider metadata", () => {
    const value = {sourceLocale: "fa" as const, customerTargetLocale: "tr" as const, translations: [{targetLocale: "tr" as const, status: "SUCCEEDED" as const, body: "Merhaba"}]};
    const markup = renderToStaticMarkup(<MessageTranslation value={value} labels={en.Staff.translation} />);
    expect(markup).toContain('lang="tr" dir="ltr"'); expect(markup).toContain(en.Staff.translation.ready);
    expect(parseMessageTranslation({...value, provider: "private"})).toBeNull();
  });
});
