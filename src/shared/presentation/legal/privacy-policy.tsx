import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import {privacyPolicy, siteConfig} from "@/shared/config/site";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

const messages = {en: enMessages, tr: trMessages, fa: faMessages, ar: arMessages} as const;

function PolicySection({heading, children}: {heading: string; children: React.ReactNode}) {
  return <section className="space-y-4 border-t border-stone-950/10 pt-9"><h2 className="text-2xl font-semibold tracking-tight text-stone-950">{heading}</h2>{children}</section>;
}

function Paragraphs({items}: {items: Readonly<Record<string, string>>}) {
  return <>{Object.values(items).map((text) => <p key={text}>{text}</p>)}</>;
}

function PolicyList({items}: {items: Readonly<Record<string, string>>}) {
  return <ul className="list-disc space-y-2 ps-6">{Object.values(items).map((text) => <li key={text}>{text}</li>)}</ul>;
}

export function PrivacyPolicy({locale}: {locale: Locale}) {
  const t = messages[locale].PrivacyPage;
  const activeInquiry = messages[locale].ActiveInquiryPrivacy;
  const inventory = messages[locale].InquiryPrivacyInventory;
  return <article className="mt-10 max-w-4xl pb-20">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t.eyebrow}</p>
    <h1 className="mt-5 text-[clamp(2.6rem,6vw,5.5rem)] font-semibold leading-[1] tracking-[-0.045em] text-stone-950">{t.heading}</h1>
    <p className="mt-4 text-sm text-muted-foreground">{t.lastUpdated}: <LtrIsolate><time dateTime={privacyPolicy.lastUpdated}>{privacyPolicy.lastUpdated}</time></LtrIsolate></p>

    <div className="mt-12 space-y-12 leading-8 text-stone-600">
      <PolicySection heading={t.controller.heading}>
        <p>{t.controller.text}</p>
        <dl className="grid gap-3 border border-emerald-950/10 bg-white/40 p-6 shadow-[0_28px_80px_-60px_rgba(28,25,23,0.45)] sm:grid-cols-[10rem_1fr] sm:p-8">
          <dt className="font-medium text-foreground">{t.controller.operatorLabel}</dt><dd>{privacyPolicy.operator}</dd>
          <dt className="font-medium text-foreground">{t.controller.locationLabel}</dt><dd><LtrIsolate>{privacyPolicy.publicLocation}</LtrIsolate></dd>
          <dt className="font-medium text-foreground">{t.controller.emailLabel}</dt><dd><a href={siteConfig.contact.emailHref} className="font-semibold text-brand underline underline-offset-4"><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a></dd>
        </dl>
      </PolicySection>

      <PolicySection heading={activeInquiry.heading}><Paragraphs items={activeInquiry.paragraphs} /></PolicySection>
      <PolicySection heading={inventory.heading}>
        <h3 className="text-lg font-semibold text-foreground">{inventory.customerHeading}</h3><PolicyList items={inventory.customer} />
        <h3 className="text-lg font-semibold text-foreground">{inventory.productHeading}</h3><PolicyList items={inventory.product} />
        <h3 className="text-lg font-semibold text-foreground">{inventory.evidenceHeading}</h3><PolicyList items={inventory.evidence} />
      </PolicySection>
      <PolicySection heading={t.purposes.heading}><PolicyList items={t.purposes.items} /></PolicySection>
      <PolicySection heading={t.cookies.heading}><Paragraphs items={t.cookies.paragraphs} /></PolicySection>
      <PolicySection heading={t.analytics.heading}><Paragraphs items={t.analytics.paragraphs} /></PolicySection>
      <PolicySection heading={t.searchVisibility.heading}><p>{t.searchVisibility.text}</p></PolicySection>
      <PolicySection heading={t.choices.heading}><p>{t.choices.textBeforeEmail} <a href={siteConfig.contact.emailHref} className="font-semibold text-brand underline underline-offset-4"><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a> {t.choices.textAfterEmail}</p><PolicyList items={t.choices.items} /></PolicySection>
      <PolicySection heading={t.children.heading}><p>{t.children.text}</p></PolicySection>
      <PolicySection heading={t.externalLinks.heading}><p>{t.externalLinks.text}</p></PolicySection>
    </div>
  </article>;
}
