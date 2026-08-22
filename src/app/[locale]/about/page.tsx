import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createAboutMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {AboutPagePresentation} from "@/shared/presentation/about/components/about-page";
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
  const [t, breadcrumbs, common] = await Promise.all([getTranslations({locale, namespace: "About"}), getTranslations({locale, namespace: "Breadcrumbs"}), getTranslations({locale, namespace: "Common"})]);
  return (
    <><AboutPagePresentation model={{isRtl: locale === "fa" || locale === "ar", breadcrumbLabel: breadcrumbs("label"), homeLabel: breadcrumbs("home"), eyebrow: t("eyebrow"), heading: t("heading"), introduction: t("introduction"), catalog: t("catalog"), pricing: t("pricing"), location: t("location"), imageAlt: t("imageAlt"), productsCta: common("viewProducts"), contactCta: t("contactCta")}} />
      <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/about"}]})} />
    </>
  );
}
