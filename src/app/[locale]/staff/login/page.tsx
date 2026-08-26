import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffLoginForm} from "@/features/staff-authentication/presentation/components/staff-login-form";
import {redirect} from "@/i18n/navigation";
import {isLocale} from "@/i18n/locale";
import {siteConfig} from "@/shared/config/site";
import {StaffLanguageSwitcher} from "@/shared/presentation/staff-shell/staff-language-switcher";

type StaffLoginPageProps = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: StaffLoginPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations({locale, namespace: "Staff"});
  return {title: t("metadata.login")};
}

export default async function StaffLoginPage({params}: StaffLoginPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status === "authorized" || access.status === "forbidden") {
    redirect({href: "/staff", locale});
  }

  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <main id="main-content" className="relative grid min-h-screen place-items-center overflow-hidden bg-stone-950 px-4 py-10 text-stone-950 sm:px-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0"><div className="absolute -start-40 -top-40 size-96 rounded-full bg-emerald-500/10 blur-3xl" /><div className="absolute -bottom-44 -end-32 size-[28rem] rounded-full bg-amber-200/10 blur-3xl" /></div>
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-stone-50 p-6 shadow-2xl sm:p-8" aria-labelledby="staff-login-title">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3"><span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-emerald-900 font-black text-white">Y</span><div className="min-w-0"><p dir="ltr" className="font-black tracking-[0.16em]">{siteConfig.identity.brandName.toUpperCase()}</p><p className="truncate text-xs text-stone-500">{t("common.operations")}</p></div></div>
          <StaffLanguageSwitcher locale={locale} label={t("navigation.changeLanguage")} variant="light" className="w-24 shrink-0" />
        </div>
        <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{t("login.eyebrow")}</p>
        <h1 id="staff-login-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{t("login.title")}</h1>
        <p className="mt-3 text-sm leading-6 text-stone-600">{access.status === "service_unavailable" ? t("states.serviceUnavailableDescription") : t("login.description")}</p>
        <StaffLoginForm labels={{email: t("login.email"), emailPlaceholder: t("login.emailPlaceholder"), password: t("login.password"), showPassword: t("login.showPassword"), hidePassword: t("login.hidePassword"), signIn: t("login.signIn"), signingIn: t("login.signingIn"), error: t("login.error")}} />
      </section>
    </main>
  );
}
