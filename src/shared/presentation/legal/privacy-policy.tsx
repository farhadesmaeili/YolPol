import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import {privacyPolicy, siteConfig} from "@/shared/config/site";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

const messages = {en: enMessages, tr: trMessages, fa: faMessages, ar: arMessages} as const;

function PolicySection({heading, children}: {heading: string; children: React.ReactNode}) {
  return <section className="space-y-4"><h2 className="text-2xl font-semibold tracking-tight">{heading}</h2>{children}</section>;
}

function Paragraphs({items}: {items: Readonly<Record<string, string>>}) {
  return <>{Object.values(items).map((text) => <p key={text}>{text}</p>)}</>;
}

function PolicyList({items}: {items: Readonly<Record<string, string>>}) {
  return <ul className="list-disc space-y-2 ps-6">{Object.values(items).map((text) => <li key={text}>{text}</li>)}</ul>;
}

export function PrivacyPolicy({locale}: {locale: Locale}) {
  const t = messages[locale].PrivacyPage;
  return <article className="mt-8 max-w-3xl">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t.eyebrow}</p>
    <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t.heading}</h1>
    <p className="mt-6 text-lg leading-8 text-muted-foreground">{t.introduction}</p>
    <p className="mt-4 text-sm text-muted-foreground">{t.lastUpdated}: <LtrIsolate><time dateTime={privacyPolicy.lastUpdated}>{privacyPolicy.lastUpdated}</time></LtrIsolate></p>

    <div className="mt-12 space-y-12 leading-7 text-muted-foreground">
      <PolicySection heading={t.controller.heading}>
        <p>{t.controller.text}</p>
        <dl className="grid gap-3 border-y border-border py-5 sm:grid-cols-[10rem_1fr]">
          <dt className="font-medium text-foreground">{t.controller.operatorLabel}</dt><dd>{privacyPolicy.operator}</dd>
          <dt className="font-medium text-foreground">{t.controller.locationLabel}</dt><dd><LtrIsolate>{privacyPolicy.publicLocation}</LtrIsolate></dd>
          <dt className="font-medium text-foreground">{t.controller.emailLabel}</dt><dd><a href={siteConfig.contact.emailHref} className="font-semibold text-brand underline underline-offset-4"><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a></dd>
        </dl>
      </PolicySection>

      <PolicySection heading={t.information.heading}>
        <p>{t.information.introduction}</p>
        <h3 className="text-lg font-semibold text-foreground">{t.information.providedHeading}</h3><PolicyList items={t.information.provided} />
        <h3 className="text-lg font-semibold text-foreground">{t.information.securityHeading}</h3><p>{t.information.securityText}</p>
        <h3 className="text-lg font-semibold text-foreground">{t.information.preferenceHeading}</h3><p>{t.information.preferenceText}</p>
      </PolicySection>

      <PolicySection heading={t.inquiryLimitation.heading}><Paragraphs items={t.inquiryLimitation.paragraphs} /></PolicySection>
      <PolicySection heading={t.purposes.heading}><PolicyList items={t.purposes.items} /></PolicySection>
      <PolicySection heading={t.retention.heading}><Paragraphs items={t.retention.paragraphs} /></PolicySection>
      <PolicySection heading={t.securityMetadata.heading}><Paragraphs items={t.securityMetadata.paragraphs} /></PolicySection>
      <PolicySection heading={t.disclosure.heading}><Paragraphs items={t.disclosure.paragraphs} /></PolicySection>
      <PolicySection heading={t.international.heading}><p>{t.international.text}</p></PolicySection>
      <PolicySection heading={t.cookies.heading}><Paragraphs items={t.cookies.paragraphs} /></PolicySection>
      <PolicySection heading={t.analytics.heading}><Paragraphs items={t.analytics.paragraphs} /></PolicySection>
      <PolicySection heading={t.searchVisibility.heading}><p>{t.searchVisibility.text}</p></PolicySection>
      <PolicySection heading={t.choices.heading}><p>{t.choices.textBeforeEmail} <a href={siteConfig.contact.emailHref} className="font-semibold text-brand underline underline-offset-4"><LtrIsolate>{siteConfig.contact.email}</LtrIsolate></a> {t.choices.textAfterEmail}</p><PolicyList items={t.choices.items} /></PolicySection>
      <PolicySection heading={t.children.heading}><p>{t.children.text}</p></PolicySection>
      <PolicySection heading={t.externalLinks.heading}><p>{t.externalLinks.text}</p></PolicySection>
      <PolicySection heading={t.changes.heading}><p>{t.changes.text}</p><PolicyList items={t.changes.items} /></PolicySection>
    </div>
  </article>;
}
