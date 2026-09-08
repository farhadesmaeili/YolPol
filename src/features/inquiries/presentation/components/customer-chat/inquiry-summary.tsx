import type {CustomerInquirySummaryDto} from "@/features/inquiries/application/dto/customer-inquiry-summary-dto";
import type {CustomerChatLabels, CustomerChatMessage} from "@/features/inquiries/presentation/view-models/customer-chat-view-model";
import type {InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import {InquiryProductImage} from "@/features/inquiries/presentation/components/inquiry-product-picker";

export function customerFollowUpMessages(messages: readonly CustomerChatMessage[], summary: CustomerInquirySummaryDto | null): readonly CustomerChatMessage[] {
  // Server-derived identity, never text matching or a general first-message heuristic.
  return summary?.details ? messages.filter((message) => !(message.sender === "customer" && message.id === summary.initialMessageId)) : messages;
}

export function InquirySummary({summary, labels, locale, products, countries}: {summary: CustomerInquirySummaryDto; labels: CustomerChatLabels["summary"]; locale: string; products: readonly InquiryProductOption[]; countries: Readonly<Record<string, string>>}) {
  return <details className="inquiry-summary group border-b border-border bg-background/60">
    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus sm:px-6">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5 shrink-0 text-brand"><path d="M7 3h10v3h3v15H4V6h3zM7 3v5h10V3M8 12h8M8 16h5" /></svg>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{labels.title}</span><span className="mt-1 block truncate text-xs text-muted-foreground">{summary.items.map(({name}) => name).join(" · ")}</span></span>
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"><path d="m5 8 5 5 5-5" /></svg>
    </summary>
    <div className="inquiry-reveal max-h-72 space-y-4 overflow-y-auto overscroll-y-contain px-4 pb-5 sm:px-6">
      <ul className="divide-y divide-border">{summary.items.map((item) => {
        const product = products.find(({id}) => id === item.productId);
        return <li key={item.productId} className="flex min-w-0 items-center gap-3 py-3">{product ? <InquiryProductImage product={product} /> : null}<div className="min-w-0"><p dir="auto" className="text-sm font-medium leading-6 [overflow-wrap:anywhere]">{item.name}</p><p className="mt-1 text-xs text-muted-foreground"><bdi>{new Intl.NumberFormat(locale).format(item.quantity)}</bdi> {labels.units[item.unit]}</p></div></li>;
      })}</ul>
      {summary.destination && (summary.destination.country || summary.destination.city) ? <div><p className="text-xs font-semibold text-muted-foreground">{labels.destination}</p><p className="mt-1 text-sm"><bdi>{summary.destination.country ? countries[summary.destination.country] ?? summary.destination.country : ""}</bdi>{summary.destination.city ? <> · <bdi>{summary.destination.city}</bdi></> : null}</p></div> : null}
      {summary.details ? <div><p className="text-xs font-semibold text-muted-foreground">{labels.details}</p><p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-7 [overflow-wrap:anywhere]">{summary.details}</p></div> : null}
      <p className="text-xs text-muted-foreground">{labels.submitted} <time dateTime={summary.createdAt}>{new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "UTC"}).format(new Date(summary.createdAt))}</time></p>
    </div>
  </details>;
}
