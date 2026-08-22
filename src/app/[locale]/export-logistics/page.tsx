import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getExportCapacityPolicy, getExportLogisticsPageModel} from "@/composition/export-logistics/export-logistics";
import {ExportLogisticsPagePresentation} from "@/features/export-logistics/presentation/components/export-logistics-page";
import {createExportLogisticsMetadata} from "@/features/export-logistics/presentation/seo/logistics-metadata";
import {isLocale} from "@/i18n/locale";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return createExportLogisticsMetadata(locale);
}

export default async function ExportLogisticsPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, breadcrumbs, model] = await Promise.all([getTranslations({locale, namespace: "ExportLogistics"}), getTranslations({locale, namespace: "Breadcrumbs"}), getExportLogisticsPageModel(locale)]);
  const labelKeys = ["heading", "product", "pallets", "add", "remove", "reset", "packages", "units", "weight", "totals", "maximum", "remaining", "feasible", "palletExceeded", "weightExceeded", "bothExceeded", "insufficientData", "invalid", "arithmeticOverflow", "kilograms", "disclaimer"] as const;
  const calculator = Object.fromEntries(labelKeys.map((key) => [key, t(`calculator.${key}`)])) as Record<(typeof labelKeys)[number], string>;

  return <><ExportLogisticsPagePresentation locale={locale} model={model} capacity={getExportCapacityPolicy()} labels={{isRtl: locale === "fa" || locale === "ar", breadcrumbLabel: breadcrumbs("label"), home: breadcrumbs("home"), eyebrow: t("eyebrow"), heading: t("heading"), introduction: t("introduction"), capacityHeading: t("capacity.heading"), capacityText: t("capacity.text"), methodHeading: t("method.heading"), methodText: t("method.text"), unavailableHeading: t("unavailable.heading"), unavailableText: t("unavailable.text"), listingFailure: t("listingFailure"), workflowHeading: t("workflow.heading"), workflowSteps: Array.from({length: 6}, (_, index) => t(`workflow.steps.${index + 1}`)), limitationsHeading: t("limitations.heading"), limitationsText: t("limitations.text"), contactCta: t("contactCta"), calculator}} /><JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/export-logistics"}]})} /></>;
}
