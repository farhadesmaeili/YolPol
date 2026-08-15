import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createAboutMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {Link} from "@/i18n/navigation";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return createAboutMetadata(locale);
}

export default async function AboutPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, breadcrumbs] = await Promise.all([getTranslations({locale, namespace: "About"}), getTranslations({locale, namespace: "Breadcrumbs"})]);
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12 sm:px-10 sm:py-16">
      <nav aria-label={breadcrumbs("label")} className="text-sm text-muted-foreground"><Link href="/">{breadcrumbs("home")}</Link><span aria-hidden="true"> / </span><span aria-current="page">{t("heading")}</span></nav>
      <article className="mt-8 max-w-3xl"><p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t("eyebrow")}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t("heading")}</h1><div className="mt-8 space-y-6 text-lg leading-8 text-muted-foreground"><p>{t("introduction")}</p><p>{t("catalog")}</p><p>{t("pricing")}</p><p>{t("location")}</p></div><Link href="/contact" className="mt-9 inline-flex min-h-12 items-center bg-brand px-6 font-semibold text-white outline-none hover:bg-foreground focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">{t("contactCta")}</Link></article>
      <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/about"}]})} />
    </div>
  );
}
