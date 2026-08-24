import type {ReactNode} from "react";

import {Link} from "@/i18n/navigation";
import {siteConfig} from "@/shared/config/site";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import {PremiumBreadcrumbs, PremiumPageShell, premiumPrimaryLinkClass} from "@/shared/presentation/marketing/premium-page-shell";

type ContactModel = Readonly<{isRtl: boolean; breadcrumbLabel: string; homeLabel: string; eyebrow: string; heading: string; introduction: string; email: string; phone: string; whatsapp: string; location: string; contactLocation: string; social: string; instagramLabel: string; linkedinLabel: string; telegramLabel: string; inquiryCta: string}>;

export function ContactPagePresentation({model}: {model: ContactModel}) {
  return <PremiumPageShell><div className="mx-auto w-full max-w-[1500px] px-4 py-8 sm:px-8 lg:px-14 xl:px-20">
    <PremiumBreadcrumbs label={model.breadcrumbLabel} home={model.homeLabel} current={model.heading} />
    <div className="grid gap-12 py-12 lg:grid-cols-[0.72fr_1.28fr] lg:py-20">
      <header className="lg:sticky lg:top-36 lg:self-start"><p className={model.isRtl ? "text-sm font-semibold text-emerald-900" : "text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-900"}>{model.eyebrow}</p><h1 className={`mt-6 text-[clamp(3rem,6vw,6.4rem)] font-semibold leading-[0.94] text-stone-950 ${model.isRtl ? "" : "tracking-[-0.06em]"}`}>{model.heading}</h1><p className="mt-7 max-w-xl text-lg leading-9 text-stone-600">{model.introduction}</p><Link href="/inquiry" className={`${premiumPrimaryLinkClass} mt-8`}>{model.inquiryCta}</Link></header>
      <div className="border-t border-stone-950/10">
        <ContactRow index="01" label={model.email}><a className="break-all font-semibold text-emerald-900 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700" href={siteConfig.contact.emailHref}><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a></ContactRow>
        <ContactRow index="02" label={model.phone}><a className="font-semibold text-emerald-900 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700" href={siteConfig.contact.phone.href}><LtrIsolate>{siteConfig.contact.phone.display}</LtrIsolate></a></ContactRow>
        <ContactRow index="03" label={model.whatsapp}><a className="font-semibold text-emerald-900 hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700" href={siteConfig.contact.whatsapp.href} target="_blank" rel="noopener noreferrer"><LtrIsolate>{siteConfig.contact.whatsapp.display}</LtrIsolate></a></ContactRow>
        <ContactRow index="04" label={model.location}><address className="not-italic text-stone-700">{model.contactLocation}</address></ContactRow>
        <ContactRow index="05" label={model.social}><div className="flex flex-wrap gap-x-6 gap-y-3"><SocialLink href={siteConfig.social.instagram} label={model.instagramLabel}>Instagram</SocialLink><SocialLink href={siteConfig.social.linkedin} label={model.linkedinLabel}>LinkedIn</SocialLink><SocialLink href={siteConfig.social.telegram} label={model.telegramLabel}>Telegram</SocialLink></div></ContactRow>
      </div>
    </div>
  </div></PremiumPageShell>;
}

function ContactRow({index, label, children}: {index: string; label: string; children: ReactNode}) { return <section className="grid min-w-0 gap-4 border-b border-stone-950/10 py-7 sm:grid-cols-[3rem_10rem_minmax(0,1fr)] sm:items-center"><span aria-hidden="true" dir="ltr" className="text-[9px] font-semibold tracking-[0.18em] text-emerald-800">{index}</span><h2 className="text-sm font-semibold text-stone-500">{label}</h2><div className="min-w-0 text-base leading-7">{children}</div></section>; }
function SocialLink({href, label, children}: {href: string; label: string; children: ReactNode}) { return <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="inline-flex min-h-11 items-center font-semibold text-emerald-900 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-emerald-700">{children}<span aria-hidden="true" className="ms-2">↗</span></a>; }
