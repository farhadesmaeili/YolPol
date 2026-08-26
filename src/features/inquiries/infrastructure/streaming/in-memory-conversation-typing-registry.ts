import type {
  ConversationTypingEvent,
  ConversationTypingParticipant,
  ConversationTypingRegistry,
} from "@/features/inquiries/application/ports/conversation-typing-ports";

type TimerHandle = ReturnType<typeof setTimeout>;
type TypingEntry = {expiresAt: number; timer: TimerHandle};
type TypingScheduler = Readonly<{
  now(): number;
  schedule(callback: () => void, milliseconds: number): TimerHandle;
  cancel(handle: TimerHandle): void;
}>;
type ListenerEntry = Readonly<{
  conversationId: string;
  participant: ConversationTypingParticipant;
  listener(event: ConversationTypingEvent): void;
}>;

export const conversationTypingTtlMs = 5_000;
export const defaultMaximumConversationTypingSubscriptions = 200;

const defaultScheduler: TypingScheduler = {
  now: () => Date.now(),
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle),
};

function stateKey(conversationId: string, participant: ConversationTypingParticipant): string {
  return `${conversationId}\u0000${participant}`;
}

export class InMemoryConversationTypingRegistry implements ConversationTypingRegistry {
  private readonly states = new Map<string, Map<string, TypingEntry>>();
  private readonly listeners = new Map<number, ListenerEntry>();
  private nextListenerId = 1;

  constructor(
    private readonly ttlMs = conversationTypingTtlMs,
    private readonly maximumSubscriptions = defaultMaximumConversationTypingSubscriptions,
    private readonly scheduler: TypingScheduler = defaultScheduler,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) throw new RangeError("Typing TTL must be a positive integer.");
    if (!Number.isSafeInteger(maximumSubscriptions) || maximumSubscriptions < 1) throw new RangeError("Maximum typing subscriptions must be a positive integer.");
  }

  update(input: Parameters<ConversationTypingRegistry["update"]>[0]): void {
    const key = stateKey(input.conversationId, input.participant);
    this.removeExpired(key, input.conversationId, input.participant);
    const actors = this.states.get(key);
    const wasActive = (actors?.size ?? 0) > 0;
    const existing = actors?.get(input.actorKey);
    if (existing) this.scheduler.cancel(existing.timer);

    if (!input.isTyping) {
      actors?.delete(input.actorKey);
      if (actors?.size === 0) this.states.delete(key);
      if (wasActive && !this.isActive(key)) this.publish(input.conversationId, input.participant, false);
      return;
    }

    const current = actors ?? new Map<string, TypingEntry>();
    const expiresAt = this.scheduler.now() + this.ttlMs;
    const timer = this.scheduler.schedule(
      () => this.expireActor(key, input.conversationId, input.participant, input.actorKey, expiresAt),
      this.ttlMs,
    );
    current.set(input.actorKey, {expiresAt, timer});
    this.states.set(key, current);
    if (!wasActive) this.publish(input.conversationId, input.participant, true);
  }

  subscribe(input: Parameters<ConversationTypingRegistry["subscribe"]>[0]) {
    if (this.listeners.size >= this.maximumSubscriptions) return null;
    const key = stateKey(input.conversationId, input.participant);
    this.removeExpired(key, input.conversationId, input.participant);
    const listenerId = this.nextListenerId++;
    this.listeners.set(listenerId, input);
    let closed = false;
    try { input.listener({participant: input.participant, isTyping: this.isActive(key)}); }
    catch {
      closed = true;
      this.listeners.delete(listenerId);
      return null;
    }
    return Object.freeze({
      close: () => {
        if (closed) return;
        closed = true;
        this.listeners.delete(listenerId);
      },
    });
  }

  activeStateCount(): number { return this.states.size; }
  activeSubscriptionCount(): number { return this.listeners.size; }

  private expireActor(
    key: string,
    conversationId: string,
    participant: ConversationTypingParticipant,
    actorKey: string,
    expectedExpiry: number,
  ): void {
    const actors = this.states.get(key);
    const entry = actors?.get(actorKey);
    if (!actors || !entry || entry.expiresAt !== expectedExpiry) return;
    if (entry.expiresAt > this.scheduler.now()) {
      entry.timer = this.scheduler.schedule(
        () => this.expireActor(key, conversationId, participant, actorKey, expectedExpiry),
        entry.expiresAt - this.scheduler.now(),
      );
      return;
    }
    const wasActive = actors.size > 0;
    actors.delete(actorKey);
    if (actors.size === 0) this.states.delete(key);
    if (wasActive && !this.isActive(key)) this.publish(conversationId, participant, false);
  }

  private removeExpired(key: string, conversationId: string, participant: ConversationTypingParticipant): void {
    const actors = this.states.get(key);
    if (!actors) return;
    const wasActive = actors.size > 0;
    const current = this.scheduler.now();
    for (const [actorKey, entry] of actors) {
      if (entry.expiresAt > current) continue;
      this.scheduler.cancel(entry.timer);
      actors.delete(actorKey);
    }
    if (actors.size === 0) this.states.delete(key);
    if (wasActive && !this.isActive(key)) this.publish(conversationId, participant, false);
  }

  private isActive(key: string): boolean {
    return (this.states.get(key)?.size ?? 0) > 0;
  }

  private publish(conversationId: string, participant: ConversationTypingParticipant, isTyping: boolean): void {
    const event = Object.freeze({participant, isTyping});
    for (const [listenerId, entry] of this.listeners) {
      if (entry.conversationId !== conversationId || entry.participant !== participant) continue;
      try { entry.listener(event); }
      catch { this.listeners.delete(listenerId); }
    }
  }
}
