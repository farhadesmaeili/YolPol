import type {ReactNode} from "react";

export function ChatContainer({headingId, title, description, isBusy, children}: {headingId: string; title: string; description: string; isBusy: boolean; children: ReactNode}) {
  return <section aria-labelledby={headingId} aria-busy={isBusy} className="customer-chat min-w-0 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_16px_60px_-32px_rgba(22,26,23,.3)] sm:rounded-3xl">
    <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-6">
      <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold tracking-tight text-white">YP</span>
      <div className="min-w-0"><h2 id={headingId} className="text-lg font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
    </header>
    {children}
  </section>;
}
