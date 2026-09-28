"use client";

import {usePathname} from "next/navigation";
import {useTranslations} from "next-intl";
import {createContext, useContext, useEffect, useRef, useState, type ReactNode} from "react";

import {
  activateGoogleAnalyticsForPathname,
  persistAnalyticsConsent,
  readStoredAnalyticsConsent,
  shouldRenderAnalyticsSettingsControl,
  shouldShowAnalyticsConsent,
} from "@/shared/presentation/analytics/analytics-route-controller";
import {
  getGoogleAnalyticsClient,
  type AnalyticsConsentDecision,
} from "@/shared/presentation/analytics/google-analytics-client";
import {isPublicAnalyticsPathname} from "@/shared/presentation/analytics/public-analytics-pathname";
import type {Locale} from "@/shared/types/locale";

type AnalyticsConsentContextValue = Readonly<{openPreferences(): void}>;

const AnalyticsConsentContext = createContext<AnalyticsConsentContextValue | null>(null);

export function AnalyticsConsentProvider({children, locale}: {children: ReactNode; locale: Locale}) {
  const pathname = usePathname();
  const publicPathname = isPublicAnalyticsPathname(pathname);
  const t = useTranslations("AnalyticsConsent");
  const [decision, setDecision] = useState<AnalyticsConsentDecision | null | undefined>(undefined);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    if (!publicPathname) {
      queueMicrotask(() => {
        if (active) {
          setDecision(undefined);
          setPreferencesOpen(false);
        }
      });
      return () => {
        active = false;
      };
    }

    const client = getGoogleAnalyticsClient();
    client.defaultConsentDenied();
    const stored = readStoredAnalyticsConsent(window.localStorage);
    if (stored === "denied") client.denyConsent();
    queueMicrotask(() => {
      if (active) setDecision(stored);
    });
    return () => {
      active = false;
    };
  }, [publicPathname]);

  useEffect(() => {
    if (!publicPathname || decision !== "granted") return;
    const controller = new AbortController();
    void activateGoogleAnalyticsForPathname({
      pathname,
      decision,
      signal: controller.signal,
      client: getGoogleAnalyticsClient(),
    }).catch(() => {
      // Aborted runtime-config requests remain fail-closed.
    });
    return () => controller.abort();
  }, [decision, pathname, publicPathname]);

  useEffect(() => {
    if (publicPathname && preferencesOpen) headingRef.current?.focus({preventScroll: true});
  }, [preferencesOpen, publicPathname]);

  const persist = (value: AnalyticsConsentDecision) => {
    persistAnalyticsConsent(window.localStorage, value);
  };

  const choose = (value: AnalyticsConsentDecision) => {
    const client = getGoogleAnalyticsClient();
    persist(value);
    if (value === "granted") client.grantConsent();
    else client.denyConsent();
    setDecision(value);
    setPreferencesOpen(false);
  };

  const visible = shouldShowAnalyticsConsent(pathname, decision, preferencesOpen);
  return <AnalyticsConsentContext.Provider value={{openPreferences: () => setPreferencesOpen(true)}}>
    {children}
    {visible ? <section
      aria-labelledby="analytics-consent-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-2xl border border-stone-950/15 bg-white/95 p-5 text-start shadow-2xl backdrop-blur sm:inset-x-6 sm:bottom-6 sm:p-6"
      dir={locale === "fa" || locale === "ar" ? "rtl" : "ltr"}
    >
      <h2 ref={headingRef} id="analytics-consent-title" tabIndex={-1} className="text-lg font-semibold text-stone-950 outline-none">{t("title")}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{t("description")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => choose("granted")} className="min-h-11 rounded-full bg-emerald-950 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-900 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">{t("accept")}</button>
        <button type="button" onClick={() => choose("denied")} className="min-h-11 rounded-full border border-stone-950/20 px-5 text-sm font-semibold text-stone-950 outline-none hover:border-emerald-900 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2">{t("reject")}</button>
        <a href={`/${locale}/privacy`} className="min-h-11 px-2 py-3 text-sm font-semibold text-brand underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-focus">{t("privacyPolicy")}</a>
      </div>
    </section> : null}
  </AnalyticsConsentContext.Provider>;
}

export function AnalyticsSettingsButton() {
  const pathname = usePathname();
  const context = useContext(AnalyticsConsentContext);
  const t = useTranslations("AnalyticsConsent");
  if (!context || !shouldRenderAnalyticsSettingsControl(pathname)) return null;
  return <button
    type="button"
    onClick={context.openPreferences}
    className="group relative inline-flex min-h-11 items-center gap-3 text-sm text-stone-600 outline-none transition-colors duration-300 hover:text-stone-950 focus-visible:ring-2 focus-visible:ring-emerald-800 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f3f1eb] motion-reduce:transition-none"
  >
    <span aria-hidden="true" className="h-px w-4 bg-stone-950/25 transition-all duration-300 group-hover:w-7 group-hover:bg-emerald-800 motion-reduce:transition-none" />
    {t("settings")}
  </button>;
}
