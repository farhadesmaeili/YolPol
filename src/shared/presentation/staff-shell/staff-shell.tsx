import type {ReactNode} from "react";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {StaffCapabilities} from "@/features/staff-authentication/application/dto/staff-capabilities";
import {StaffLogoutButton} from "@/features/staff-authentication/presentation/components/staff-logout-button";
import {Link} from "@/i18n/navigation";
import {siteConfig} from "@/shared/config/site";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import {StaffNavigation} from "@/shared/presentation/staff-shell/staff-navigation";
import {StaffLanguageSwitcher} from "@/shared/presentation/staff-shell/staff-language-switcher";
import type {Locale} from "@/shared/types/locale";

export type StaffShellLabels = Readonly<{
  dashboard: string;
  aiOperations: string;
  aiProviders: string;
  inquiries: string;
  logout: string;
  logoutError: string;
  loggingOut: string;
  navigation: string;
  changeLanguage: string;
  operations: string;
  role: string;
  roles: Readonly<Record<StaffPrincipal["role"], string>>;
  signedInAs: string;
  skipToContent: string;
  team: string;
}>;

export function StaffShell({children, labels, locale, principal, capabilities}: Readonly<{
  children: ReactNode;
  capabilities: StaffCapabilities;
  labels: StaffShellLabels;
  locale: Locale;
  principal: StaffPrincipal;
}>) {
  const navigation = [
    {href: "/staff" as const, label: labels.dashboard},
    {href: "/staff/inquiries" as const, label: labels.inquiries},
    ...(capabilities.mayViewAiOperations ? [{href: "/staff/ai-operations" as const, label: labels.aiOperations}] : []),
    ...(capabilities.mayViewAiProviderRegistry ? [{href: "/staff/ai-providers" as const, label: labels.aiProviders}] : []),
    ...(capabilities.mayManageTeam ? [{href: "/staff/team" as const, label: labels.team}] : []),
  ];

  return (
    <div data-staff-root className="min-h-screen bg-stone-100 text-stone-950">
      <a href="#staff-main" className="sr-only rounded bg-white px-4 py-3 focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:ring-2 focus:ring-emerald-800">
        {labels.skipToContent}
      </a>
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="bg-stone-950 px-4 py-4 text-white sm:px-6 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4 lg:block lg:pb-6">
            <Link href="/staff" className="inline-flex min-h-11 items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
              <span aria-hidden="true" className="grid size-10 place-items-center rounded-xl border border-emerald-300/30 bg-emerald-300/10 font-black text-emerald-100">Y</span>
              <span>
                <span dir="ltr" className="block text-base font-bold tracking-[0.14em]">{siteConfig.identity.brandName.toUpperCase()}</span>
                <span className="block text-xs text-stone-400">{labels.operations}</span>
              </span>
            </Link>
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100 lg:hidden">
              {labels.roles[principal.role]}
            </span>
          </div>
          <div className="mt-4 lg:mt-6">
            <StaffNavigation items={navigation} label={labels.navigation} />
          </div>
          <div className="mt-5 hidden border-t border-white/10 pt-5 lg:mt-auto lg:block">
            <p className="text-xs text-stone-400">{labels.signedInAs}</p>
            <p className="mt-1 break-words text-sm font-semibold text-white">{principal.displayName}</p>
            <p className="mt-2 text-xs text-stone-400">
              {labels.role}: <span className="font-semibold text-emerald-200">{labels.roles[principal.role]}</span>
            </p>
            <p className="mt-2 text-[11px] text-stone-500"><LtrIsolate>{principal.teamMemberId}</LtrIsolate></p>
            <div className="mt-4">
              <StaffLanguageSwitcher locale={locale} label={labels.changeLanguage} variant="dark" className="w-full" />
            </div>
            <div className="mt-4">
              <StaffLogoutButton variant="dark" labels={{logout: labels.logout, loggingOut: labels.loggingOut, error: labels.logoutError}} />
            </div>
          </div>
        </aside>
        <div className="min-w-0">
          <header className="flex items-start justify-between gap-2 border-b border-stone-200 bg-white px-3 py-3 sm:items-center sm:px-6 lg:px-8">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-stone-900">{principal.displayName}</p>
              <p className="text-xs text-stone-500">{labels.roles[principal.role]}</p>
            </div>
            <div data-staff-mobile-actions className="flex min-w-0 shrink-0 items-start gap-2 lg:hidden">
              <StaffLanguageSwitcher locale={locale} label={labels.changeLanguage} variant="light" className="w-20 shrink-0 sm:w-24" />
              <StaffLogoutButton variant="light" labels={{logout: labels.logout, loggingOut: labels.loggingOut, error: labels.logoutError}} />
            </div>
          </header>
          <main id="staff-main" className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
