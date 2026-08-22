import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {createContactMetadata} from "@/app/[locale]/_site-metadata";
import {isLocale} from "@/i18n/locale";
import {ContactPagePresentation} from "@/shared/presentation/contact/components/contact-page";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";

type Props = {params: Promise<{locale: string}>};

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return createContactMetadata(locale);
}

export const dynamic = "force-static";
export default async function ContactPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const [t, breadcrumbs, inquiry] = await Promise.all([getTranslations({locale, namespace: "Contact"}), getTranslations({locale, namespace: "Breadcrumbs"}), getTranslations({locale, namespace: "InquiryPage"})]);
  return (
    <><ContactPagePresentation model={{isRtl: locale === "fa" || locale === "ar", breadcrumbLabel: breadcrumbs("label"), homeLabel: breadcrumbs("home"), eyebrow: t("eyebrow"), heading: t("heading"), introduction: t("introduction"), email: t("email"), phone: t("phone"), whatsapp: t("whatsapp"), location: t("location"), social: t("social"), instagramLabel: t("instagramLabel"), linkedinLabel: t("linkedinLabel"), telegramLabel: t("telegramLabel"), inquiryCta: inquiry("heading")}} />
      <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: t("heading"), pathname: "/contact"}]})} />
    </>
  );
}
