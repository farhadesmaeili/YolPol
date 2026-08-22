import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {listInquiryProductOptions} from "@/composition/inquiries/inquiry-presentation";
import {InquiryForm} from "@/features/inquiries/presentation/components/inquiry-form";
import {InquiryPagePresentation} from "@/features/inquiries/presentation/components/inquiry-page";
import {createInquiryMetadata} from "@/features/inquiries/presentation/seo/inquiry-metadata";
import {isLocale} from "@/i18n/locale";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";

type Props = {params: Promise<{locale: string}>};
export const dynamic = "force-static";
export async function generateMetadata({params}: Props): Promise<Metadata> { const {locale} = await params; if (!isLocale(locale)) notFound(); return createInquiryMetadata(locale); }

export default async function InquiryPage({params}: Props) {
  const {locale} = await params; if (!isLocale(locale)) notFound(); setRequestLocale(locale);
  const [products, t, breadcrumbs, corrections, productSelection, consent] = await Promise.all([listInquiryProductOptions(locale), getTranslations({locale, namespace: "InquiryPage"}), getTranslations({locale, namespace: "Breadcrumbs"}), getTranslations({locale, namespace: "InquiryFormCorrections"}), getTranslations({locale, namespace: "InquiryProductSelection"}), getTranslations({locale, namespace: "InquiryConsent"})]);
  return <><InquiryPagePresentation labels={{isRtl: locale === "fa" || locale === "ar", breadcrumbLabel: breadcrumbs("label"), home: breadcrumbs("home"), eyebrow: t("eyebrow"), heading: t("heading"), introduction: t("introduction"), pricing: t("pricing")}}>
    <InquiryForm locale={locale} products={products} privacyHref={`/${locale}/privacy`} labels={{customer:t("form.customer"),fullName:t("form.fullName"),company:t("form.company"),country:t("form.country"),city:t("form.city"),email:t("form.email"),phone:t("form.phone"),preferredContact:t("form.preferredContact"),contactMethods:{email:t("contactMethods.email"),whatsapp:t("contactMethods.whatsapp"),telegram:t("contactMethods.telegram"),phone:t("contactMethods.phone")},products:t("form.products"),product:t("form.product"),requestedQuantityRequired:corrections("requestedQuantityRequired"),unitRequired:corrections("unitRequiredLabel"),selectUnit:corrections("selectUnit"),units:{pieces:t("units.pieces"),packages:t("units.packages"),pallets:t("units.pallets"),truckloads:t("units.truckloads")},removeProduct:t("form.removeProduct"),productSelection:{emptyTitle:productSelection("emptyTitle"),emptyDescription:productSelection("emptyDescription"),selectProduct:productSelection("selectProduct"),productPlaceholder:productSelection("productPlaceholder"),addProduct:productSelection("addProduct"),addAnotherProduct:productSelection("addAnotherProduct"),allProductsAdded:productSelection("allProductsAdded")},errors:{invalidField:corrections("invalidField"),quantityRequired:corrections("quantityRequired"),quantityInvalid:corrections("quantityInvalid"),quantityTooLarge:corrections("quantityTooLarge"),unitRequired:corrections("unitRequired"),productsRequired:corrections("productsRequired"),privacyRequired:corrections("privacyRequired"),destinationDependency:corrections("destinationDependency")},destination:t("form.destination"),destinationCountry:t("form.destinationCountry"),destinationCity:t("form.destinationCity"),message:t("form.message"),privacyPrefix:t("form.privacy"),privacyLink:consent("privacyLink"),privacySuffix:consent("privacySuffix"),review:t("form.review"),prepared:t("form.prepared"),invalid:t("form.invalid"),submissionUnavailable:t("form.submissionUnavailable"),emailAction:t("form.emailAction"),whatsappAction:t("form.whatsappAction")}} />
  </InquiryPagePresentation><JsonLdScript data={createBreadcrumbJsonLd({locale, items:[{name:breadcrumbs("home"),pathname:"/"},{name:t("heading"),pathname:"/inquiry"}]})} /></>;
}
