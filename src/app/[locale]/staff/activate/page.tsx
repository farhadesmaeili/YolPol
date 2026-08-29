import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {StaffActivationForm} from "@/features/staff-authentication/presentation/components/staff-activation-form";
import {isLocale} from "@/i18n/locale";
import {siteConfig} from "@/shared/config/site";
import {StaffLanguageSwitcher} from "@/shared/presentation/staff-shell/staff-language-switcher";

type Props = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({locale, namespace: "Staff"});
  return {title: t("metadata.activation"), robots: {index: false, follow: false, nocache: true}};
}

export default async function StaffActivationPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({locale, namespace: "Staff"});
  return <main id="main-content" className="grid min-h-screen place-items-center bg-stone-950 px-4 py-10">
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-stone-50 p-6 shadow-2xl sm:p-8" aria-labelledby="staff-activation-title">
      <div className="flex items-start justify-between gap-3"><div><p dir="ltr" className="font-black tracking-[0.16em]">{siteConfig.identity.brandName.toUpperCase()}</p><p className="text-xs text-stone-500">{t("common.operations")}</p></div><StaffLanguageSwitcher locale={locale} label={t("navigation.changeLanguage")} variant="light" className="w-24" /></div>
      <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{t("activation.eyebrow")}</p>
      <h1 id="staff-activation-title" className="mt-2 text-2xl font-bold">{t("activation.title")}</h1>
      <p className="mt-3 text-sm leading-6 text-stone-600">{t("activation.description")}</p>
      <StaffActivationForm labels={{email: t("activation.email"), activationCode: t("activation.activationCode"), password: t("activation.password"), passwordHint: t("activation.passwordHint"), activate: t("activation.activate"), activating: t("activation.activating"), unavailable: t("activation.unavailable"), invalidPassword: t("activation.invalidPassword"), failed: t("activation.failed"), success: t("activation.success"), signIn: t("activation.signIn")}} />
    </section>
  </main>;
}
