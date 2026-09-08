import type {ReactNode} from "react";
import {PremiumBreadcrumbs, PremiumPageShell} from "@/shared/presentation/marketing/premium-page-shell";

export function InquiryPagePresentation({children, labels}: {children: ReactNode; labels: Readonly<{isRtl: boolean; breadcrumbLabel: string; home: string; eyebrow: string; heading: string; introduction: string; pricing: string}>}) {
  return <PremiumPageShell><div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-8 lg:px-12">
    <PremiumBreadcrumbs label={labels.breadcrumbLabel} home={labels.home} current={labels.heading} />
    <header className="grid gap-6 border-b border-border py-8 sm:py-12 lg:grid-cols-[minmax(0,1fr)_15rem] lg:items-end">
      <div><p className={`flex items-center gap-3 text-xs font-semibold text-brand ${labels.isRtl ? "" : "uppercase tracking-[.2em]"}`}><span aria-hidden="true" className="h-px w-8 bg-accent" />{labels.eyebrow}</p>
        <h1 className={`mt-4 max-w-3xl text-[clamp(2rem,5vw,4rem)] font-semibold leading-[1.2] ${labels.isRtl ? "" : "tracking-[-.045em]"}`}>{labels.heading}</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{labels.introduction}</p></div>
      <p className="border-s-2 border-accent ps-4 text-sm leading-7 text-muted-foreground">{labels.pricing}</p>
    </header>
    <div className="mx-auto min-w-0 max-w-4xl">{children}</div>
  </div></PremiumPageShell>;
}
