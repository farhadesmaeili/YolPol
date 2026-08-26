import type {ReactNode} from "react";

import type {InquiryStatus} from "@/features/inquiries/domain/types/inquiry-types";
import type {Locale} from "@/shared/types/locale";

export function StaffPageHeader({eyebrow, title, description, action}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}>) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-950 sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600 sm:text-base">{description}</p>
      </div>
      {action}
    </header>
  );
}

const statusClasses: Readonly<Record<InquiryStatus, string>> = {
  NEW: "border-sky-200 bg-sky-50 text-sky-800",
  WAITING_FOR_TEAM: "border-amber-200 bg-amber-50 text-amber-900",
  WAITING_FOR_CUSTOMER: "border-violet-200 bg-violet-50 text-violet-800",
  QUOTED: "border-blue-200 bg-blue-50 text-blue-800",
  CONFIRMED: "border-emerald-200 bg-emerald-50 text-emerald-800",
  CLOSED: "border-stone-300 bg-stone-100 text-stone-700",
};

export function StaffStatusBadge({status, label}: Readonly<{status: InquiryStatus; label: string}>) {
  return <span className={`inline-flex min-h-7 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>{label}</span>;
}

export function StaffDateTime({locale, value}: Readonly<{locale: Locale; value: string}>) {
  const date = new Date(value);
  const valid = Number.isFinite(date.getTime());
  const formatted = valid
    ? new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}).format(date)
    : "—";
  return <time dateTime={valid ? date.toISOString() : undefined} title={valid ? date.toISOString() : undefined} dir="auto">{formatted}</time>;
}

export function StaffPanel({children, title, className = ""}: Readonly<{children: ReactNode; title?: string; className?: string}>) {
  return (
    <section className={`rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6 ${className}`.trim()}>
      {title ? <h2 className="mb-4 text-lg font-bold text-stone-950">{title}</h2> : null}
      {children}
    </section>
  );
}

export function StaffState({title, description, action}: Readonly<{title: string; description: string; action?: ReactNode}>) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center shadow-sm sm:px-8">
      <h2 className="text-lg font-bold text-stone-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
