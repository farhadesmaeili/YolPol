import type {ReactNode} from "react";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {redirect} from "@/i18n/navigation";
import {isLocale} from "@/i18n/locale";
import {StaffShell} from "@/shared/presentation/staff-shell/staff-shell";

type ProtectedStaffLayoutProps = Readonly<{children: ReactNode; params: Promise<{locale: string}>}>;

export default async function ProtectedStaffLayout({children, params}: ProtectedStaffLayoutProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status === "unauthorized") redirect({href: "/staff/login", locale});

  const t = await getTranslations({locale, namespace: "Staff"});
  if (access.status !== "authorized") {
    const forbidden = access.status === "forbidden";
    return (
      <main id="main-content" className="grid min-h-screen place-items-center bg-stone-100 px-4 py-10">
        <section className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-bold">{forbidden ? t("states.forbiddenTitle") : t("states.serviceUnavailableTitle")}</h1>
          <p className="mt-3 text-sm leading-6 text-stone-600">{forbidden ? t("states.forbiddenDescription") : t("states.serviceUnavailableDescription")}</p>
        </section>
      </main>
    );
  }

  return (
    <StaffShell
      locale={locale}
      principal={access.principal}
      labels={{
        dashboard: t("navigation.dashboard"),
        inquiries: t("navigation.inquiries"),
        team: t("navigation.team"),
        navigation: t("navigation.label"),
        changeLanguage: t("navigation.changeLanguage"),
        skipToContent: t("navigation.skipToContent"),
        operations: t("common.operations"),
        signedInAs: t("common.signedInAs"),
        role: t("common.role"),
        roles: {ADMIN: t("roles.ADMIN"), SALES: t("roles.SALES")},
        logout: t("logout.button"),
        loggingOut: t("logout.loggingOut"),
        logoutError: t("logout.error"),
      }}
    >
      {children}
    </StaffShell>
  );
}
