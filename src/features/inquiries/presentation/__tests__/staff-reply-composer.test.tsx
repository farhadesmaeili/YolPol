import {readFileSync} from "node:fs";
import {join} from "node:path";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import type {StaffConversationMessageDto} from "@/features/inquiries/application/dto/staff-conversation-message-dto";
import {StaffReplyComposer, type StaffReplyComposerLabels} from "@/features/inquiries/presentation/components/staff/staff-reply-composer";
import {resolveStaffMessageAuthor} from "@/features/inquiries/presentation/components/staff/staff-conversation-message-list";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));

const message: StaffConversationMessageDto = Object.freeze({
  id: "staff_web_message-1",
  senderType: "INTERNAL_USER",
  channel: "WEBSITE",
  actorReference: "staff:member-1",
  body: "A persisted reply",
  createdAt: "2026-08-26T10:00:00.000Z",
});

function labels(catalog: typeof enMessages.Staff, customerTyping = enMessages.ConversationTyping.customer): StaffReplyComposerLabels {
  return {
    aiAgent: catalog.senders.AI_AGENT,
    customer: catalog.senders.CUSTOMER,
    system: catalog.senders.SYSTEM,
    yolpolTeam: catalog.reply.yolpolTeam,
    channels: catalog.channels,
    emptyTitle: catalog.states.emptyConversationTitle,
    emptyDescription: catalog.states.emptyConversationDescription,
    messageList: catalog.reply.messageList,
    replyToCustomer: catalog.reply.replyToCustomer,
    writeReply: catalog.reply.writeReply,
    characters: catalog.reply.characters,
    customerTyping,
    keyboardHint: catalog.reply.keyboardHint,
    sendReply: catalog.reply.sendReply,
    sending: catalog.reply.sending,
    sent: catalog.reply.sent,
    errors: {
      required: catalog.reply.errors.required,
      too_long: catalog.reply.errors.tooLong,
      invalid_message: catalog.reply.errors.invalidMessage,
      session_expired: catalog.reply.errors.sessionExpired,
      permission_denied: catalog.reply.errors.permissionDenied,
      conversation_unavailable: catalog.reply.errors.conversationUnavailable,
      retry_conflict: catalog.reply.errors.retryConflict,
      message_too_large: catalog.reply.errors.messageTooLarge,
      unsupported_request: catalog.reply.errors.unsupportedRequest,
      rate_limited: catalog.reply.errors.rateLimited,
      service_unavailable: catalog.reply.errors.serviceUnavailable,
    },
  };
}

describe("Staff Reply Composer presentation", () => {
  it("renders a localized accessible multiline composer with mobile-safe controls", () => {
    const html = renderToStaticMarkup(<StaffReplyComposer customerDisplayName="Buyer" initialMessages={[]} inquiryId="inquiry-1" labels={labels(enMessages.Staff)} locale="en" teamMemberNames={{}} />);
    expect(html).toContain("Reply to customer");
    expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Write a reply<\/label>/u);
    expect(html).toContain("<textarea");
    expect(html).toContain('name="staff-reply"');
    expect(html).toContain("required");
    expect(html).toContain("10,000");
    expect(html).toContain("Ctrl+Enter");
    expect(html).toContain('type="submit"');
    expect(html).toContain("Send reply");
    expect(html).toContain("min-h-36");
    expect(html).toContain("min-h-12");
    expect(html).toContain("w-full");
    expect(html).toContain("sm:w-auto");
  });

  it("renders complete Persian RTL-ready content without physical-side spacing", () => {
    const html = renderToStaticMarkup(<StaffReplyComposer customerDisplayName="خریدار" initialMessages={[]} inquiryId="inquiry-1" labels={labels(faMessages.Staff, faMessages.ConversationTyping.customer)} locale="fa" teamMemberNames={{}} />);
    expect(html).toContain(faMessages.Staff.reply.replyToCustomer);
    expect(html).toContain(faMessages.Staff.reply.sendReply);
    const source = readFileSync(join(process.cwd(), "src", "features", "inquiries", "presentation", "components", "staff", "staff-reply-composer.tsx"), "utf8");
    expect(source).not.toMatch(/\b(?:ml|mr|pl|pr)-/u);
  });

  it("uses resolved Team Member names and safe fallbacks without displaying raw actor references", () => {
    const catalog = labels(enMessages.Staff);
    expect(resolveStaffMessageAuthor(message, "Buyer", {"member-1": "Farhad"}, catalog)).toBe("Farhad");
    expect(resolveStaffMessageAuthor({...message, actorReference: null}, "Buyer", {}, catalog)).toBe("YOLPOL Team");
    expect(resolveStaffMessageAuthor({...message, actorReference: "staff:inactive-member"}, "Buyer", {}, catalog)).toBe("YOLPOL Team");

    const html = renderToStaticMarkup(<StaffReplyComposer customerDisplayName="Buyer" initialMessages={[message, {...message, id: "message-2", actorReference: null}]} inquiryId="inquiry-1" labels={catalog} locale="en" teamMemberNames={{"member-1": "Farhad"}} />);
    expect(html).toContain("Farhad");
    expect(html).toContain("YOLPOL Team");
    expect(html).not.toContain("staff:member-1");
  });

  it("keeps credentials and drafts out of browser storage", () => {
    const directory = join(process.cwd(), "src", "features", "inquiries", "presentation");
    const source = [
      join(directory, "components", "staff", "staff-reply-composer.tsx"),
      join(directory, "clients", "staff-conversation-reply-client.ts"),
      join(directory, "state", "staff-reply-reducer.ts"),
    ].map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/u);
  });
});
