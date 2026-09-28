import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createPrivacyMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {PrivacyPolicy} from "@/shared/presentation/legal/privacy-policy";
import {PremiumBreadcrumbs, PremiumPageShell} from "@/shared/presentation/marketing/premium-page-shell";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";

type Props = {params: Promise<{locale: string}>};
export const dynamic = "force-static";

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return createPrivacyMetadata(locale);
}

export default async function PrivacyPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [privacy, breadcrumbs] = await Promise.all([
    getTranslations({locale, namespace: "PrivacyPage"}),
    getTranslations({locale, namespace: "Breadcrumbs"}),
  ]);
  return <PremiumPageShell><div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:px-14 xl:px-20">
    <PremiumBreadcrumbs label={breadcrumbs("label")} home={breadcrumbs("home")} current={privacy("heading")} />
    <PrivacyPolicy locale={locale} />
    <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: privacy("heading"), pathname: "/privacy"}]})} />
  </div></PremiumPageShell>;
}
