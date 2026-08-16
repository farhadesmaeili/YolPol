import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createPrivacyMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {Link} from "@/i18n/navigation";
import {PrivacyPolicy} from "@/shared/presentation/legal/privacy-policy";
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
  return <div className="mx-auto w-full max-w-5xl px-5 py-12 sm:px-10 sm:py-16">
    <nav aria-label={breadcrumbs("label")} className="text-sm text-muted-foreground"><Link href="/">{breadcrumbs("home")}</Link><span aria-hidden="true"> / </span><span aria-current="page">{privacy("heading")}</span></nav>
    <PrivacyPolicy locale={locale} />
    <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: privacy("heading"), pathname: "/privacy"}]})} />
  </div>;
}
