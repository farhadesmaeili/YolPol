import type {CustomerChatMessage as CustomerChatMessageModel} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export function MessageItem({message, author, locale = "en"}: {message: CustomerChatMessageModel; author: string; locale?: string}) {
  const customer = message.sender === "customer";
  return <li data-message-id={message.id} className={`chat-message flex min-w-0 ${customer ? "justify-end" : "justify-start"}`}>
    <article className={`max-w-[90%] min-w-0 rounded-2xl px-4 py-3 sm:max-w-[76%] ${customer ? "rounded-ee-md bg-brand text-white" : "rounded-es-md border border-border/70 bg-surface text-foreground shadow-sm"}`}>
      <p className={`text-[11px] font-semibold ${customer ? "text-white/80" : "text-brand"}`}>{author}</p>
      <p dir="auto" className="mt-1 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{message.body}</p>
      {message.createdAt ? <time dateTime={message.createdAt} className={`mt-2 block text-end text-[10px] ${customer ? "text-white/75" : "text-muted-foreground"}`}><bdi>{new Intl.DateTimeFormat(locale, {hour: "2-digit", minute: "2-digit", timeZone: "UTC"}).format(new Date(message.createdAt))}</bdi></time> : null}
    </article>
  </li>;
}
