import Image from "next/image";

import {Link} from "@/i18n/navigation";
import {PremiumBreadcrumbs, PremiumPageShell, premiumPrimaryLinkClass, premiumSecondaryLinkClass} from "@/shared/presentation/marketing/premium-page-shell";

type AboutModel = Readonly<{isRtl: boolean; breadcrumbLabel: string; homeLabel: string; eyebrow: string; heading: string; introduction: string; catalog: string; pricing: string; location: string; imageAlt: string; inquiryCta: string; processCta: string}>;

export function AboutPagePresentation({model}: {model: AboutModel}) {
  return <PremiumPageShell><div className="mx-auto w-full max-w-[1700px] px-4 py-8 sm:px-8 lg:px-14 xl:px-20">
    <PremiumBreadcrumbs label={model.breadcrumbLabel} home={model.homeLabel} current={model.heading} />
    <header className="grid gap-10 border-b border-stone-950/10 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(18rem,0.55fr)] lg:items-end lg:py-20">
      <div><p className={model.isRtl ? "text-sm font-semibold text-emerald-900" : "text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-900"}>{model.eyebrow}</p><h1 className={`mt-6 max-w-5xl text-[clamp(3rem,7vw,7.7rem)] font-semibold leading-[0.91] text-stone-950 ${model.isRtl ? "" : "tracking-[-0.065em]"}`}>{model.heading}</h1></div>
      <p className="border-s border-emerald-900/35 ps-6 text-lg leading-9 text-stone-600">{model.introduction}</p>
    </header>
    <section className="grid gap-8 py-14 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:py-24">
      <div className="order-2 lg:order-1"><EditorialFact index="01" text={model.catalog} /><EditorialFact index="02" text={model.pricing} /><EditorialFact index="03" text={model.location} /><div className="mt-9 flex flex-wrap gap-3"><Link href="/inquiry" className={premiumPrimaryLinkClass}>{model.inquiryCta}</Link><Link href="/wholesale-process" className={premiumSecondaryLinkClass}>{model.processCta}</Link></div></div>
      <figure className="relative order-1 min-h-[28rem] overflow-hidden lg:order-2 lg:min-h-[42rem]"><Image src="/images/about/hero/yolpol-about-hero-desktop.webp" alt={model.imageAlt} fill priority sizes="(min-width:1024px) 58vw, 100vw" className="object-cover" /><div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-stone-950/25 via-transparent to-transparent" /><figcaption aria-hidden="true" dir="ltr" className="absolute bottom-5 end-6 text-[9px] font-semibold tracking-[0.25em] text-white/80">YOLPOL / B2B / WHOLESALE</figcaption></figure>
    </section>
  </div></PremiumPageShell>;
}

function EditorialFact({index, text}: {index: string; text: string}) { return <article className="grid grid-cols-[2.5rem_1fr] gap-4 border-t border-stone-950/10 py-7 text-start"><span aria-hidden="true" dir="ltr" className="text-[9px] font-semibold tracking-[0.18em] text-emerald-800">{index}</span><p className="max-w-xl leading-8 text-stone-700">{text}</p></article>; }
