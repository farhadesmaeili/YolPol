import {ConversationAgentExecutionError} from "@/features/conversation-ai-agent/domain/errors/conversation-agent-errors";

// Bound the await even when a read-only dependency fails to honor cancellation.
export async function withConversationAgentDeadline<T>(work: (signal: AbortSignal) => Promise<T>, milliseconds: number, parent?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, {once: true});
  if (parent?.aborted) controller.abort();
  const timer = setTimeout(abort, milliseconds);
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new ConversationAgentExecutionError("TIMEOUT"));
    controller.signal.addEventListener("abort", onAbort, {once: true});
    if (controller.signal.aborted) onAbort();
  });
  try {
    const pending = Promise.resolve().then(() => {
      if (controller.signal.aborted) throw new ConversationAgentExecutionError("TIMEOUT");
      return work(controller.signal);
    });
    return await Promise.race([pending, cancelled]);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", onAbort);
  }
}
