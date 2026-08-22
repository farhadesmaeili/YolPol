import type {ReactNode} from "react";

import {PremiumBreadcrumbs, PremiumPageShell} from "@/shared/presentation/marketing/premium-page-shell";

export function InquiryPagePresentation({children, labels}: {children: ReactNode; labels: Readonly<{isRtl: boolean; breadcrumbLabel: string; home: string; eyebrow: string; heading: string; introduction: string; pricing: string}>}) {
  return <PremiumPageShell><div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8 lg:px-14 xl:px-20">
    <PremiumBreadcrumbs label={labels.breadcrumbLabel} home={labels.home} current={labels.heading} />
    <header className="grid gap-8 border-b border-stone-950/10 py-10 md:grid-cols-[minmax(0,1fr)_18rem] md:items-end lg:py-16"><div><div className="flex items-center gap-4"><span aria-hidden="true" className="size-2 rounded-full bg-emerald-800" /><p className={labels.isRtl ? "text-sm font-semibold text-emerald-900" : "text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-900"}>{labels.eyebrow}</p></div><h1 className={`mt-6 max-w-4xl text-[clamp(2.8rem,6vw,6rem)] font-semibold leading-[0.96] text-stone-950 ${labels.isRtl ? "" : "tracking-[-0.055em]"}`}>{labels.heading}</h1><p className="mt-6 max-w-3xl text-lg leading-9 text-stone-600">{labels.introduction}</p></div><p className="border-s-2 border-emerald-800 ps-5 text-sm font-semibold leading-7 text-emerald-900">{labels.pricing}</p></header>
    <div className="grid gap-8 pb-16 pt-4 lg:grid-cols-[12rem_minmax(0,1fr)]"><aside aria-hidden="true" className="hidden pt-12 lg:block"><div dir="ltr" className="sticky top-36 space-y-5 text-[9px] font-semibold tracking-[0.2em] text-stone-400"><p>01</p><p>02</p><p>03</p><p>04</p></div></aside><div className="min-w-0">{children}</div></div>
  </div></PremiumPageShell>;
}
