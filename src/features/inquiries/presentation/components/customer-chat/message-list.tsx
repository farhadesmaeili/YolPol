import {MessageItem} from "@/features/inquiries/presentation/components/customer-chat/message-item";
import type {CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export function MessageList({messages, label, empty, customerAuthor, supportAuthor}: {messages: readonly CustomerChatMessage[]; label: string; empty: string; customerAuthor: string; supportAuthor: string}) {
  return <div role="log" aria-live="polite" aria-relevant="additions" aria-label={label} className="min-h-40 max-h-[24rem] min-w-0 overflow-y-auto border border-stone-950/10 bg-[#f3f1eb]/75 p-3 sm:min-h-52 sm:max-h-[28rem] sm:p-5">
    {messages.length === 0 ? <p className="flex min-h-32 items-center justify-center px-4 text-center text-sm leading-6 text-stone-500 sm:min-h-40">{empty}</p> : <ol className="space-y-3">{messages.map((message) => <MessageItem key={message.id} message={message} author={message.sender === "customer" ? customerAuthor : supportAuthor} />)}</ol>}
  </div>;
}
