import {describe, expect, it, vi} from "vitest";

import type {ExternalChannelReply} from "@/features/inquiries/application/dto/notification-message";
import type {TelegramDeliveryRepository} from "@/features/inquiries/application/ports/communication-ports";
import type {CorrelatedConversationMessageWriter} from "@/features/inquiries/application/ports/conversation-ports";
import {ReceiveTelegramReply} from "@/features/inquiries/application/use-cases/receive-telegram-reply";
import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";
import type {StaffRole} from "@/features/staff-authentication/domain/types/staff-role";

const reply: ExternalChannelReply = {
  externalUpdateId: "987654", externalMessageId: "-100123:45", externalRecipientId: "-100123",
  senderExternalId: "456", body: "Please tell the customer production is available.", repliedMessageId: "44",
};

function deliveryRepository(conversationId: string | null = "conversation-1"): TelegramDeliveryRepository {
  return {
    snapshotRecipients: vi.fn(), claimDue: vi.fn(), markDelivered: vi.fn(), markRetryable: vi.fn(), markPermanentFailure: vi.fn(), markUnknown: vi.fn(), summarizeEvent: vi.fn(),
    findConversationByProviderMessage: vi.fn().mockResolvedValue(conversationId ? {conversationId} : null),
  };
}

function capabilities(mayReplyToCustomerConversation: boolean): StaffCapabilities {
  return {
    mayAccessStaffPanel: true, mayViewInquiries: true, mayViewCustomerConversation: true, mayReplyToCustomerConversation,
    mayPublishStaffTyping: mayReplyToCustomerConversation, mayUpdateInquiryWorkflow: mayReplyToCustomerConversation,
    mayViewAiOperations: true, mayManageAiOperations: false,
    mayViewAiProviderRegistry: true, mayManageAiProviders: false, mayManageAiCredentialReferences: false,
    mayManageTeam: false, mayCreateStaffInvitation: false, mayDeactivateStaffMember: false,
    mayReactivateStaffMember: false, mayChangeStaffRole: false, mayAssignAdminRole: false, mayAssignSuperAdminRole: false,
  };
}

function actorResolver(input: Readonly<{resolved?: boolean; canReply?: boolean; role?: StaffRole}> = {}) {
  const {resolved = true, canReply = true, role = "SALES"} = input;
  return {execute: vi.fn().mockResolvedValue(resolved ? {
    status: "resolved",
    actor: {
      principal: {staffAccountId: "account-1", teamMemberId: "member-1", role, displayName: "Staff", actorReference: "staff:member-1"},
      capabilities: capabilities(canReply),
    },
  } : {status: "unresolved"})};
}

describe("ReceiveTelegramReply", () => {
  it("uses the verified Telegram User ID actor and preserves provider delivery correlation", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    const deliveries = deliveryRepository();
    const actors = actorResolver();
    const useCase = new ReceiveTelegramReply(actors, deliveries, {appendForConversation}, {now: () => new Date("2026-08-25T01:02:03.000Z")});
    await expect(useCase.execute(reply)).resolves.toEqual({status: "created"});
    expect(actors.execute).toHaveBeenCalledWith({telegramUserId: "456"});
    expect(deliveries.findConversationByProviderMessage).toHaveBeenCalledWith({telegramChatId: -100123, telegramMessageId: 44});
    const stored = appendForConversation.mock.calls[0]?.[1];
    expect(stored?.id.value).toBe("telegram_update_987654");
    expect(stored?.actorReference?.value).toBe("staff:member-1");
  });

  it("rejects a sender without an active verified Staff link before delivery correlation", async () => {
    const deliveries = deliveryRepository();
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    await expect(new ReceiveTelegramReply(actorResolver({resolved: false}), deliveries, {appendForConversation}, {now: () => new Date()}).execute(reply)).resolves.toEqual({status: "unauthorized"});
    expect(deliveries.findConversationByProviderMessage).not.toHaveBeenCalled();
  });

  it("denies Viewer and permits every current reply-capable role", async () => {
    for (const [role, canReply] of [["VIEWER", false], ["SALES", true], ["ADMIN", true], ["SUPER_ADMIN", true]] as const) {
      const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
      await expect(new ReceiveTelegramReply(actorResolver({role, canReply}), deliveryRepository(), {appendForConversation}, {now: () => new Date()}).execute(reply))
        .resolves.toEqual({status: canReply ? "created" : "unauthorized"});
    }
  });

  it("uses the replied-to private or group chat binding independently from sender identity", async () => {
    const deliveries = deliveryRepository();
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>().mockResolvedValue("created");
    await expect(new ReceiveTelegramReply(actorResolver(), deliveries, {appendForConversation}, {now: () => new Date()}).execute({...reply, externalRecipientId: "456", externalMessageId: "456:45"})).resolves.toEqual({status: "created"});
    expect(deliveries.findConversationByProviderMessage).toHaveBeenCalledWith({telegramChatId: 456, telegramMessageId: 44});
  });

  it("rejects an unknown provider binding without persistence", async () => {
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    await expect(new ReceiveTelegramReply(actorResolver(), deliveryRepository(null), {appendForConversation}, {now: () => new Date()}).execute(reply)).resolves.toEqual({status: "conversation_not_found"});
  });

  it("rejects invalid provider identifiers before actor resolution", async () => {
    const actors = actorResolver();
    const appendForConversation = vi.fn<CorrelatedConversationMessageWriter["appendForConversation"]>();
    await expect(new ReceiveTelegramReply(actors, deliveryRepository(), {appendForConversation}, {now: () => new Date()}).execute({...reply, externalRecipientId: "not-numeric"})).resolves.toEqual({status: "invalid_reply"});
    expect(actors.execute).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "conversation_not_found"] as const)("preserves the %s persistence outcome", async (status) => {
    const useCase = new ReceiveTelegramReply(actorResolver(), deliveryRepository(), {async appendForConversation() { return status; }}, {now: () => new Date()});
    await expect(useCase.execute(reply)).resolves.toEqual({status});
  });
});
