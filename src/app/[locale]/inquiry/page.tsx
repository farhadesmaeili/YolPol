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
  // Active-locale catalogs: namespace: "InquiryFormCorrections"; namespace: "InquiryProductSelection"; namespace: "CustomerChat".
  const {locale} = await params; if (!isLocale(locale)) notFound(); setRequestLocale(locale);
  const [products,t,breadcrumbs,corrections,productSelection,consent,submission,chat] = await Promise.all([listInquiryProductOptions(locale),getTranslations({locale,namespace:"InquiryPage"}),getTranslations({locale,namespace:"Breadcrumbs"}),getTranslations({locale,namespace:"InquiryFormCorrections"}),getTranslations({locale,namespace:"InquiryProductSelection"}),getTranslations({locale,namespace:"InquiryConsent"}),getTranslations({locale,namespace:"InquirySubmission"}),getTranslations({locale,namespace:"CustomerChat"})]);
  const labels = {
    customer:t("form.customer"),fullName:t("form.fullName"),company:t("form.company"),country:t("form.country"),city:t("form.city"),email:t("form.email"),phone:t("form.phone"),preferredContact:t("form.preferredContact"),whatsappPhone:t("form.whatsappPhone"),telegramUsername:t("form.telegramUsername"),contactMethods:{email:t("contactMethods.email"),whatsapp:t("contactMethods.whatsapp"),telegram:t("contactMethods.telegram")},countries:{IR:t("countries.IR"),TR:t("countries.TR"),IQ:t("countries.IQ"),AM:t("countries.AM"),AZ:t("countries.AZ"),TM:t("countries.TM"),AF:t("countries.AF"),PK:t("countries.PK"),AE:t("countries.AE"),SA:t("countries.SA"),QA:t("countries.QA"),KW:t("countries.KW"),BH:t("countries.BH"),OM:t("countries.OM")},countryPlaceholder:t("form.countryPlaceholder"),
    products:t("form.products"),product:t("form.product"),palletCountRequired:corrections("palletCountRequiredLabel"),removeProduct:t("form.removeProduct"),productSelection:{emptyTitle:productSelection("emptyTitle"),emptyDescription:productSelection("emptyDescription"),selectProduct:productSelection("selectProduct"),productPlaceholder:productSelection("productPlaceholder"),addProduct:productSelection("addProduct"),addAnotherProduct:productSelection("addAnotherProduct"),allProductsAdded:productSelection("allProductsAdded")},
    errors:{invalidField:corrections("invalidField"),phoneInvalid:corrections("phoneInvalid"),whatsappPhoneInvalid:corrections("whatsappPhoneInvalid"),telegramUsernameInvalid:corrections("telegramUsernameInvalid"),preferredContactRequired:corrections("preferredContactRequired"),palletCountRequired:corrections("palletCountRequired"),palletCountInvalid:corrections("palletCountInvalid"),palletCountTooLarge:corrections("palletCountTooLarge"),productsRequired:corrections("productsRequired"),privacyRequired:corrections("privacyRequired"),destinationDependency:corrections("destinationDependency")},destination:t("form.destination"),destinationCountry:t("form.destinationCountry"),destinationCity:t("form.destinationCity"),message:t("form.message"),privacyLink:consent("privacyLink"),privacyAgreement:consent("privacyAgreement"),submit:submission("submit"),submitting:submission("submitting"),succeeded:submission("succeeded"),reference:submission("reference"),invalid:submission("invalid"),productUnavailable:submission("productUnavailable"),serviceFailure:submission("serviceFailure"),retry:submission("retry"),rateLimited:submission("rateLimited"),timeout:submission("timeout"),
  };
  const chatLabels = {title:chat("title"),description:chat("description"),messages:chat("messages"),empty:chat("empty"),customerAuthor:chat("customerAuthor"),supportAuthor:chat("supportAuthor"),messageLabel:chat("messageLabel"),messagePlaceholder:chat("messagePlaceholder"),send:chat("send"),sending:chat("sending"),loading:chat("loading"),loadingHistory:chat("loadingHistory"),sent:chat("sent"),errorTitle:chat("errorTitle"),historyErrorTitle:chat("historyErrorTitle"),errors:{required:chat("errors.required"),tooLong:chat("errors.tooLong"),validation:chat("errors.validation"),rateLimited:chat("errors.rateLimited"),network:chat("errors.network"),service:chat("errors.service"),history:chat("errors.history")}};
  return <><InquiryPagePresentation labels={{isRtl:locale==="fa"||locale==="ar",breadcrumbLabel:breadcrumbs("label"),home:breadcrumbs("home"),eyebrow:t("eyebrow"),heading:t("heading"),introduction:t("introduction"),pricing:t("pricing")}}><InquiryForm locale={locale} products={products} privacyHref={`/${locale}/privacy`} labels={labels} chatLabels={chatLabels} /></InquiryPagePresentation><JsonLdScript data={createBreadcrumbJsonLd({locale,items:[{name:breadcrumbs("home"),pathname:"/"},{name:t("heading"),pathname:"/inquiry"}]})} /></>;
}
