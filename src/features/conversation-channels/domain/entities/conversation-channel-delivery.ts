import {ConversationChannelStateError, ConversationChannelValidationError} from "@/features/conversation-channels/domain/errors/conversation-channel-errors";
import type {ConversationChannelDeliveryStatus, ConversationChannelFailureCategory} from "@/features/conversation-channels/domain/types/conversation-channel-types";
import {conversationChannelMaximumDeliveryAttempts, parseConversationChannelAttempts, parseConversationChannelConversationId, parseConversationChannelDate, parseConversationChannelExternalReference, parseConversationChannelFailureCategory, parseConversationChannelInternalId, parseConversationChannelMessageId} from "@/features/conversation-channels/domain/value-objects/conversation-channel-values";

export type ConversationChannelDeliverySnapshot = Readonly<{
  id: string;
  conversationId: string;
  messageId: string;
  bindingId: string;
  status: ConversationChannelDeliveryStatus;
  attempts: number;
  leaseToken: string | null;
  leasedUntil: Date | null;
  providerMessageReference: string | null;
  failureCategory: ConversationChannelFailureCategory | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredAt: Date | null;
  terminalAt: Date | null;
}>;

export class ConversationChannelDelivery {
  private constructor(private state: ConversationChannelDeliverySnapshot) {}

  static schedule(input: Readonly<{id: string; conversationId: string; messageId: string; bindingId: string; createdAt: Date}>): ConversationChannelDelivery {
    const createdAt = parseConversationChannelDate(input.createdAt, "createdAt");
    return new ConversationChannelDelivery(Object.freeze({
      id: parseConversationChannelInternalId(input.id, "id"),
      conversationId: parseConversationChannelConversationId(input.conversationId),
      messageId: parseConversationChannelMessageId(input.messageId),
      bindingId: parseConversationChannelInternalId(input.bindingId, "bindingId"),
      status: "PENDING", attempts: 0, leaseToken: null, leasedUntil: null,
      providerMessageReference: null, failureCategory: null,
      createdAt, updatedAt: createdAt, deliveredAt: null, terminalAt: null,
    }));
  }

  static reconstitute(input: ConversationChannelDeliverySnapshot): ConversationChannelDelivery {
    const delivery = ConversationChannelDelivery.schedule(input);
    const status = input.status;
    if (!["PENDING", "RUNNING", "DELIVERED", "FAILED", "UNKNOWN"].includes(status)) {
      throw new ConversationChannelValidationError("status", "Delivery status is invalid.");
    }
    const state = Object.freeze({
      ...delivery.state,
      status,
      attempts: parseConversationChannelAttempts(input.attempts),
      leaseToken: input.leaseToken === null ? null : parseConversationChannelInternalId(input.leaseToken, "leaseToken"),
      leasedUntil: input.leasedUntil === null ? null : parseConversationChannelDate(input.leasedUntil, "leasedUntil"),
      providerMessageReference: input.providerMessageReference === null ? null : parseConversationChannelExternalReference(input.providerMessageReference, "providerMessageReference"),
      failureCategory: input.failureCategory === null ? null : parseConversationChannelFailureCategory(input.failureCategory),
      updatedAt: parseConversationChannelDate(input.updatedAt, "updatedAt"),
      deliveredAt: input.deliveredAt === null ? null : parseConversationChannelDate(input.deliveredAt, "deliveredAt"),
      terminalAt: input.terminalAt === null ? null : parseConversationChannelDate(input.terminalAt, "terminalAt"),
    });
    ConversationChannelDelivery.assertConsistent(state);
    delivery.state = state;
    return delivery;
  }

  claim(input: Readonly<{leaseToken: string; leasedUntil: Date; now: Date}>): void {
    if (this.state.status !== "PENDING") throw new ConversationChannelStateError("Only a pending delivery can be claimed.");
    if (this.state.attempts >= conversationChannelMaximumDeliveryAttempts) throw new ConversationChannelStateError("Delivery attempts are exhausted.");
    const now = parseConversationChannelDate(input.now, "now");
    const leasedUntil = parseConversationChannelDate(input.leasedUntil, "leasedUntil");
    if (leasedUntil <= now) throw new ConversationChannelValidationError("leasedUntil", "Delivery lease must expire in the future.");
    this.state = Object.freeze({...this.state, status: "RUNNING", attempts: this.state.attempts + 1,
      leaseToken: parseConversationChannelInternalId(input.leaseToken, "leaseToken"), leasedUntil, failureCategory: null, updatedAt: now});
  }

  deliver(providerMessageReference: string, nowInput: Date): void {
    this.requireRunning();
    const now = parseConversationChannelDate(nowInput, "now");
    this.state = Object.freeze({...this.state, status: "DELIVERED", leaseToken: null, leasedUntil: null,
      providerMessageReference: parseConversationChannelExternalReference(providerMessageReference, "providerMessageReference"),
      failureCategory: null, deliveredAt: now, terminalAt: now, updatedAt: now});
  }

  fail(categoryInput: ConversationChannelFailureCategory, nowInput: Date): void {
    if (categoryInput === "UNKNOWN_OUTCOME") { this.markUnknown(nowInput); return; }
    this.requireRunning();
    const now = parseConversationChannelDate(nowInput, "now");
    this.state = Object.freeze({...this.state, status: "FAILED", leaseToken: null, leasedUntil: null,
      failureCategory: parseConversationChannelFailureCategory(categoryInput), terminalAt: now, updatedAt: now});
  }

  markUnknown(nowInput: Date): void {
    this.requireRunning();
    const now = parseConversationChannelDate(nowInput, "now");
    this.state = Object.freeze({...this.state, status: "UNKNOWN", leaseToken: null, leasedUntil: null,
      failureCategory: "UNKNOWN_OUTCOME", terminalAt: now, updatedAt: now});
  }

  retry(categoryInput: ConversationChannelFailureCategory, nowInput: Date): void {
    if (categoryInput === "UNKNOWN_OUTCOME") { this.markUnknown(nowInput); return; }
    this.requireRunning();
    if (this.state.attempts >= conversationChannelMaximumDeliveryAttempts) {
      this.fail(categoryInput, nowInput);
      return;
    }
    const now = parseConversationChannelDate(nowInput, "now");
    this.state = Object.freeze({...this.state, status: "PENDING", leaseToken: null, leasedUntil: null,
      failureCategory: parseConversationChannelFailureCategory(categoryInput), updatedAt: now});
  }

  toSnapshot(): ConversationChannelDeliverySnapshot {
    return Object.freeze({...this.state,
      createdAt: new Date(this.state.createdAt), updatedAt: new Date(this.state.updatedAt),
      leasedUntil: this.state.leasedUntil ? new Date(this.state.leasedUntil) : null,
      deliveredAt: this.state.deliveredAt ? new Date(this.state.deliveredAt) : null,
      terminalAt: this.state.terminalAt ? new Date(this.state.terminalAt) : null,
    });
  }

  private requireRunning(): void {
    if (this.state.status !== "RUNNING") throw new ConversationChannelStateError("Only a running delivery can be finalized.");
  }

  private static assertConsistent(state: ConversationChannelDeliverySnapshot): void {
    if (state.updatedAt < state.createdAt || (state.terminalAt && state.terminalAt < state.createdAt)
      || (state.deliveredAt && state.deliveredAt < state.createdAt)) throw new ConversationChannelValidationError("timestamps", "Delivery timestamps are invalid.");
    const running = state.status === "RUNNING";
    if (running ? (!state.leaseToken || !state.leasedUntil || state.leasedUntil <= state.updatedAt)
      : (state.leaseToken !== null || state.leasedUntil !== null)) throw new ConversationChannelValidationError("lease", "Delivery lease state is invalid.");
    if ((state.status === "PENDING" && state.attempts >= conversationChannelMaximumDeliveryAttempts)
      || (state.status !== "PENDING" && state.attempts < 1)) throw new ConversationChannelValidationError("attempts", "Delivery attempts do not match its state.");
    if ((state.status === "RUNNING" && state.failureCategory !== null)
      || (state.status !== "UNKNOWN" && state.failureCategory === "UNKNOWN_OUTCOME")) throw new ConversationChannelValidationError("failureCategory", "Delivery failure category does not match its state.");
    if (state.status === "DELIVERED") {
      if (!state.providerMessageReference || !state.deliveredAt || !state.terminalAt || state.failureCategory) throw new ConversationChannelValidationError("outcome", "Delivered outcome is invalid.");
    } else if (state.providerMessageReference || state.deliveredAt) throw new ConversationChannelValidationError("outcome", "Non-delivered outcome is invalid.");
    if (["DELIVERED", "FAILED", "UNKNOWN"].includes(state.status) !== (state.terminalAt !== null)) throw new ConversationChannelValidationError("terminalAt", "Terminal delivery state is invalid.");
    if (state.status === "FAILED" && !state.failureCategory) throw new ConversationChannelValidationError("failureCategory", "Failed delivery requires a failure category.");
    if (state.status === "UNKNOWN" && state.failureCategory !== "UNKNOWN_OUTCOME") throw new ConversationChannelValidationError("failureCategory", "Unknown delivery requires the unknown-outcome category.");
  }
}
