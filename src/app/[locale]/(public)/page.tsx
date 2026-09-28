import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { getExportCapacityPolicy } from "@/composition/export-logistics/export-logistics";
import { routing, type Locale } from "@/i18n/routing";
import { formatHumanNumber } from "@/shared/presentation/bidi/bidi-isolate";
import { HomeHero } from "@/shared/presentation/home/components/home-hero";
import type { HomeHeroViewModel } from "@/shared/presentation/home/view-models/home-hero-view-model";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createOrganizationJsonLd} from "@/shared/seo/organization-json-ld";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const translations = await getTranslations({ locale, namespace: "HomePage" });
  const capacity = getExportCapacityPolicy();

  return (
    <>
      <HomeHero model={createHomeHeroModel(locale, translations, capacity)} />
      <JsonLdScript data={createOrganizationJsonLd(locale)} />
    </>
  );
}

function createHomeHeroModel(
  locale: Locale,
  t: Awaited<ReturnType<typeof getTranslations<"HomePage">>>,
  capacity: ReturnType<typeof getExportCapacityPolicy>,
): HomeHeroViewModel {
  const isRtl = locale === "fa" || locale === "ar";
  return {
    locale,
    isRtl,
    arrow: isRtl ? "←" : "→",
    eyebrow: t("eyebrow"),
    heading: t("heading"),
    description: t("description"),
    catalog: t("catalog"),
    imageAlt: t("imageAlt"),
    inquiryCta: t("inquiryCta"),
    productsCta: t("productsCta"),
    glassExport: t("glassExport"),
    exportPlanning: t("exportPlanning"),
    referenceConfiguration: t("referenceConfiguration"),
    capacityTitle: t("capacityTitle"),
    capacityDescription: t("capacityDescription"),
    palletsLabel: t("pallets"),
    palletLayout: t("palletLayout"),
    maximumGrossWeight: t("maximumGrossWeight"),
    tradeMode: t("tradeMode"),
    exportLabel: t("exportLabel"),
    capacitySummary: t("capacitySummary"),
    kilograms: t("kilograms"),
    planningLimit: t("planningLimit"),
    transportationNote: t("transportationNote"),
    networkLabel: t("networkLabel"),
    technicalIndex: t("technicalIndex"),
    palletCount: capacity.maxPallets,
    formattedPalletCount: formatHumanNumber(locale, capacity.maxPallets),
    layout: `${formatHumanNumber(locale, 13)} × ${formatHumanNumber(locale, 2)}`,
    grossWeightKilograms: capacity.maxGrossWeightKilograms,
  };
}
