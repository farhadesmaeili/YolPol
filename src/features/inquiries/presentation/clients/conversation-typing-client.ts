export const conversationTypingHeartbeatIntervalMs = 2_000;
export const conversationTypingInactivityThresholdMs = 3_000;

type TimerHandle = ReturnType<typeof setTimeout>;
type TypingScheduler = Readonly<{
  schedule(callback: () => void, milliseconds: number): TimerHandle;
  cancel(handle: TimerHandle): void;
}>;
type TypingSender = (isTyping: boolean) => void | Promise<void>;

const defaultScheduler: TypingScheduler = {
  schedule: (callback, milliseconds) => setTimeout(callback, milliseconds),
  cancel: (handle) => clearTimeout(handle),
};

export class ConversationTypingHeartbeat {
  private active = false;
  private heartbeat: TimerHandle | null = null;
  private inactivity: TimerHandle | null = null;

  constructor(private readonly send: TypingSender, private readonly scheduler: TypingScheduler = defaultScheduler) {}

  draftChanged(draft: string): void {
    if (draft.trim().length === 0) {
      this.stop();
      return;
    }
    if (!this.active) {
      this.active = true;
      this.deliver(true);
      this.scheduleHeartbeat();
    }
    if (this.inactivity) this.scheduler.cancel(this.inactivity);
    this.inactivity = this.scheduler.schedule(() => this.stop(), conversationTypingInactivityThresholdMs);
  }

  stop(): void {
    if (this.heartbeat) this.scheduler.cancel(this.heartbeat);
    if (this.inactivity) this.scheduler.cancel(this.inactivity);
    this.heartbeat = null;
    this.inactivity = null;
    if (!this.active) return;
    this.active = false;
    this.deliver(false);
  }

  dispose(): void { this.stop(); }

  private scheduleHeartbeat(): void {
    this.heartbeat = this.scheduler.schedule(() => {
      if (!this.active) return;
      this.deliver(true);
      this.scheduleHeartbeat();
    }, conversationTypingHeartbeatIntervalMs);
  }

  private deliver(isTyping: boolean): void {
    try { void Promise.resolve(this.send(isTyping)).catch(() => undefined); }
    catch { /* Typing presence is best effort and cannot block message sending. */ }
  }
}

type TypingFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const inquiryIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;

async function postTyping(url: string, isTyping: boolean, fetcher: TypingFetch): Promise<void> {
  try {
    await fetcher(url, {
      method: "POST",
      headers: {Accept: "application/json", "Content-Type": "application/json"},
      body: JSON.stringify({isTyping}),
      keepalive: true,
    });
  } catch { /* TTL is the correctness fallback when best-effort presence delivery fails. */ }
}

export async function sendCustomerConversationTyping(
  accessToken: string,
  isTyping: boolean,
  fetcher: TypingFetch = fetch,
): Promise<void> {
  const tokenPattern = /^ypc_[A-Za-z0-9_-]{43}$/u;
  if (!tokenPattern.test(accessToken)) return;
  await postTyping(`/api/conversations/${encodeURIComponent(accessToken)}/typing`, isTyping, fetcher);
}

export async function sendStaffConversationTyping(
  inquiryId: string,
  isTyping: boolean,
  fetcher: TypingFetch = fetch,
): Promise<void> {
  if (!inquiryIdPattern.test(inquiryId)) return;
  await postTyping(`/api/staff/inquiries/${encodeURIComponent(inquiryId)}/typing`, isTyping, fetcher);
}

export function parseConversationTypingEvent(value: unknown, participant: "CUSTOMER" | "STAFF"): boolean | null {
  if (typeof value !== "object" || value === null || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "isTyping,participant") return null;
  if (record.participant !== participant || typeof record.isTyping !== "boolean") return null;
  return record.isTyping;
}
