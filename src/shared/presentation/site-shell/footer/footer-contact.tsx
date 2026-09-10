import {Fragment, type ReactNode} from "react";

import { publicSocialLinks, siteConfig } from "@/shared/config/site";
import { LtrIsolate } from "@/shared/presentation/bidi/bidi-isolate";
import { FooterSectionHeading } from "@/shared/presentation/site-shell/footer/footer-section-heading";
import type { Locale } from "@/shared/types/locale";

const contactLinkClass =
  "group flex min-h-11 min-w-0 items-center justify-between gap-3 text-stone-700 outline-none transition-colors duration-300 hover:text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-800 motion-reduce:transition-none";
const socialLinkClass =
  "group inline-flex min-h-11 items-center gap-2 text-xs font-semibold tracking-[0.08em] text-stone-500 outline-none transition-colors duration-300 hover:text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] motion-reduce:transition-none";

type FooterContactLabels = Readonly<{
  heading: string;
  location: string;
  instagram: string;
  telegram: string;
}>;

export function FooterContact({ labels, isRtl, locale }: { labels: FooterContactLabels; isRtl: boolean; locale: Locale }) {
  return (
    <section className="min-w-0 text-start">
      <FooterSectionHeading index="03" isRtl={isRtl}>{labels.heading}</FooterSectionHeading>
      <div className="relative mt-8 overflow-hidden border border-stone-950/[0.09] bg-white/30 p-5 backdrop-blur-xl sm:p-6">
        <div aria-hidden="true" className="absolute start-0 top-0 h-full w-[3px] bg-gradient-to-b from-emerald-800 via-emerald-700/40 to-transparent" />
        <address className="min-w-0 space-y-2 text-sm not-italic">
          <a href={siteConfig.contact.emailHref} className={contactLinkClass}>
            <LtrIsolate className="max-w-full break-all">{siteConfig.contact.email}</LtrIsolate>
            <span aria-hidden="true" className="shrink-0 text-stone-400">↗</span>
          </a>
          <div aria-hidden="true" className="h-px bg-stone-950/[0.07]" />
          {siteConfig.contact.phones.map((phone) => (
            <Fragment key={phone.id}>
              <a href={phone.href} className={contactLinkClass}>
                <LtrIsolate>{phone.display}</LtrIsolate>
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-emerald-800" />
              </a>
              <div aria-hidden="true" className="h-px bg-stone-950/[0.07]" />
            </Fragment>
          ))}
          <div className="py-2">
            <p className="text-xs font-medium text-stone-400">{labels.location}</p>
            <p className="mt-2 max-w-xs break-words leading-6 text-stone-700">{siteConfig.contact.location.officeAddress[locale]}</p>
          </div>
        </address>
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
        {publicSocialLinks.map((social) => (
          <SocialLink key={social.id} href={social.href} id={social.id} label={labels[social.id]}>
            <LtrIsolate>{social.label}</LtrIsolate>
          </SocialLink>
        ))}
      </ul>
    </section>
  );
}

type PublicSocialId = (typeof publicSocialLinks)[number]["id"];

function SocialLink({ href, id, label, children }: { href: string; id: PublicSocialId; label: string; children: ReactNode }) {
  return (
    <li>
      <a className={socialLinkClass} href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
        <SocialIcon id={id} />
        {children}
      </a>
    </li>
  );
}

function SocialIcon({ id }: { id: PublicSocialId }) {
  if (id === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 shrink-0" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-4 shrink-0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="m21 3-7.6 18-4.3-7.1L3 10.8 21 3Z" />
      <path d="m9.1 13.9 5.1-4.6" />
    </svg>
  );
}
