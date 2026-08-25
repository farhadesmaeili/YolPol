import type {ReactNode} from "react";

export function ChatContainer({headingId, title, description, isBusy, children}: {headingId: string; title: string; description: string; isBusy: boolean; children: ReactNode}) {
  return <section aria-labelledby={headingId} aria-busy={isBusy} className="mt-8 min-w-0 border border-stone-950/10 bg-white/45 shadow-[0_28px_80px_-60px_rgba(28,25,23,0.55)] backdrop-blur-sm">
    <header className="border-b border-stone-950/10 px-5 py-5 sm:px-7 sm:py-6">
      <div className="flex items-center gap-3"><span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-emerald-800" /><h2 id={headingId} className="text-xl font-semibold text-stone-950 sm:text-2xl">{title}</h2></div>
      <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">{description}</p>
    </header>
    <div className="grid min-w-0 gap-5 p-4 sm:p-6 lg:p-7">{children}</div>
  </section>;
}
