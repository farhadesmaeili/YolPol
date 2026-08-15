import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {getExportLogisticsPageModel} from "@/composition/export-logistics/export-logistics";
import {ExportLoadCalculator} from "@/features/export-logistics/presentation/components/export-load-calculator";
import {createExportLogisticsMetadata} from "@/features/export-logistics/presentation/seo/logistics-metadata";
import {isLocale} from "@/i18n/locale";
import {Link} from "@/i18n/navigation";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";

type Props = {params: Promise<{locale: string}>};
export async function generateMetadata({params}: Props): Promise<Metadata> { const {locale} = await params; if (!isLocale(locale)) notFound(); return createExportLogisticsMetadata(locale); }
export default async function ExportLogisticsPage({params}: Props) {
  const {locale} = await params; if (!isLocale(locale)) notFound(); setRequestLocale(locale);
  const [t, breadcrumbs, model] = await Promise.all([getTranslations({locale, namespace: "ExportLogistics"}), getTranslations({locale, namespace: "Breadcrumbs"}), getExportLogisticsPageModel(locale)]);
  const labelKeys = ["heading", "product", "pallets", "add", "remove", "reset", "packages", "units", "weight", "totals", "maximum", "remaining", "feasible", "palletExceeded", "weightExceeded", "bothExceeded", "insufficientData", "invalid", "arithmeticOverflow", "kilograms", "disclaimer"] as const;
  const labels = Object.fromEntries(labelKeys.map((key) => [key, t(`calculator.${key}`)])) as Record<(typeof labelKeys)[number], string>;
  const catalogReady = model.status === "ready";
  return <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16"><nav aria-label={breadcrumbs("label")} className="text-sm text-muted-foreground"><Link href="/">{breadcrumbs("home")}</Link><span aria-hidden="true"> / </span><span aria-current="page">{t("heading")}</span></nav><div><p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-brand">{t("eyebrow")}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">{t("heading")}</h1><p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{t("introduction")}</p><section className="mt-10 grid gap-6 md:grid-cols-2"><div className="border border-border p-6"><h2 className="text-2xl font-semibold">{t("capacity.heading")}</h2><p className="mt-3">{t("capacity.text")}</p></div><div className="border border-border p-6"><h2 className="text-2xl font-semibold">{t("method.heading")}</h2><p className="mt-3">{t("method.text")}</p></div></section>{catalogReady ? <><ExportLoadCalculator products={model.eligible} labels={labels} locale={locale} />{model.unavailable.length ? <section className="mt-10"><h2 className="text-2xl font-semibold">{t("unavailable.heading")}</h2><p className="mt-2 text-muted-foreground">{t("unavailable.text")}</p><ul className="mt-4 list-disc space-y-2 ps-6">{model.unavailable.map((product) => <li key={product.id}>{product.name} ({product.sku})</li>)}</ul></section> : null}</> : <p role="alert" className="mt-10 border border-border bg-muted p-6">{t("listingFailure")}</p>}<section className="mt-12"><h2 className="text-2xl font-semibold">{t("workflow.heading")}</h2><ol className="mt-5 list-decimal space-y-3 ps-6">{Array.from({length: 6}, (_, index) => <li key={index}>{t(`workflow.steps.${index + 1}`)}</li>)}</ol></section><section className="mt-12 bg-muted p-6"><h2 className="text-2xl font-semibold">{t("limitations.heading")}</h2><p className="mt-3 leading-7">{t("limitations.text")}</p><Link href="/contact" className="mt-6 inline-flex min-h-12 items-center bg-brand px-6 font-semibold text-white">{t("contactCta")}</Link></section></div><JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/export-logistics"}]})} /></div>;
}

