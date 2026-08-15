import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createContactMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {Link} from "@/i18n/navigation";
import {siteConfig} from "@/shared/config/site";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return createContactMetadata(locale);
}

export default async function ContactPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, breadcrumbs] = await Promise.all([getTranslations({locale, namespace: "Contact"}), getTranslations({locale, namespace: "Breadcrumbs"})]);
  const external = "font-medium text-brand underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus";
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <nav aria-label={breadcrumbs("label")} className="text-sm text-muted-foreground"><Link href="/">{breadcrumbs("home")}</Link><span aria-hidden="true"> / </span><span aria-current="page">{t("heading")}</span></nav>
      <header className="mt-8 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t("eyebrow")}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t("heading")}</h1><p className="mt-6 text-lg leading-8 text-muted-foreground">{t("introduction")}</p></header>
      <div className="mt-10 grid gap-px border border-border bg-border sm:grid-cols-2"><ContactItem label={t("email")}><a className={external} href={siteConfig.contact.emailHref}>{siteConfig.contact.email}</a></ContactItem><ContactItem label={t("phone")}><a className={external} href={siteConfig.contact.phoneHref}>{siteConfig.contact.phone}</a></ContactItem><ContactItem label={t("whatsapp")}><a className={external} href={siteConfig.contact.whatsappHref} target="_blank" rel="noopener noreferrer">{siteConfig.contact.whatsapp}</a></ContactItem><ContactItem label={t("location")}><span>{siteConfig.contact.location}</span></ContactItem><ContactItem label={t("social")}><div className="flex flex-wrap gap-4"><a className={external} href={siteConfig.social.instagram} target="_blank" rel="noopener noreferrer" aria-label={t("instagramLabel")}>Instagram</a><a className={external} href={siteConfig.social.linkedin} target="_blank" rel="noopener noreferrer" aria-label={t("linkedinLabel")}>LinkedIn</a><a className={external} href={siteConfig.social.telegram} target="_blank" rel="noopener noreferrer" aria-label={t("telegramLabel")}>Telegram</a></div></ContactItem></div>
      <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/contact"}]})} />
    </div>
  );
}

function ContactItem({label, children}: {label: string; children: React.ReactNode}) {return <section className="bg-surface p-6"><h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{label}</h2><div className="mt-3 text-base">{children}</div></section>;}
