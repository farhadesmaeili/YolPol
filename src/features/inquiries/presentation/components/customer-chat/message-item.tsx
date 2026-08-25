import type {CustomerChatMessage as CustomerChatMessageModel} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";

export function MessageItem({message, author}: {message: CustomerChatMessageModel; author: string}) {
  const customer = message.sender === "customer";
  return <li className={`flex min-w-0 ${customer ? "justify-end" : "justify-start"}`}>
    <article className={`max-w-[88%] min-w-0 px-4 py-3 sm:max-w-[75%] sm:px-5 ${customer ? "bg-emerald-950 text-white" : "border border-stone-950/10 bg-stone-100 text-stone-950"}`}>
      <p className={`text-xs font-semibold ${customer ? "text-emerald-100" : "text-emerald-900"}`}>{author}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>
    </article>
  </li>;
}
