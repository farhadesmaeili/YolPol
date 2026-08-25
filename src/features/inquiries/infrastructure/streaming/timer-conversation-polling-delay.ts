import type {ConversationPollingDelay} from "@/features/inquiries/application/ports/conversation-stream-ports";

export class TimerConversationPollingDelay implements ConversationPollingDelay {
  wait(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new Error("Polling was cancelled."));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", cancel);
        resolve();
      }, milliseconds);
      const cancel = () => {
        clearTimeout(timer);
        reject(new Error("Polling was cancelled."));
      };
      signal.addEventListener("abort", cancel, {once: true});
    });
  }
}
