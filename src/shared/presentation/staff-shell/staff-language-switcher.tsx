"use client";

import {useSearchParams} from "next/navigation";
import type {ChangeEvent} from "react";

import {getLocaleDirection} from "@/i18n/locale";
import {usePathname, useRouter} from "@/i18n/navigation";
import {isSupportedLocale, supportedLocales, type Locale} from "@/shared/types/locale";

export type StaffLanguageSwitcherVariant = "dark" | "light";

const nativeLanguageNames: Readonly<Record<Locale, string>> = {
  en: "English",
  tr: "Türkçe",
  fa: "فارسی",
  ar: "العربية",
};

export const staffLanguageOptions: readonly Readonly<{
  locale: Locale;
  label: string;
}>[] = Object.freeze(supportedLocales.map((locale) => Object.freeze({locale, label: nativeLanguageNames[locale]})));

const selectVariantClasses: Readonly<Record<StaffLanguageSwitcherVariant, string>> = {
  dark: "border-white/20 bg-white/5 text-white hover:bg-white/10 focus-visible:ring-emerald-300",
  light: "border-stone-300 bg-white text-stone-800 hover:bg-stone-50 focus-visible:ring-emerald-700",
};

type StaffLocaleRouter = Readonly<{
  replace(href: string, options: Readonly<{locale: Locale}>): void;
}>;

export function buildStaffLocaleHref(pathname: string, queryString: string): string {
  return queryString ? `${pathname}?${queryString}` : pathname;
}

export function navigateToStaffLocale(
  router: StaffLocaleRouter,
  locale: Locale,
  pathname: string,
  queryString: string,
): void {
  router.replace(buildStaffLocaleHref(pathname, queryString), {locale});
}

export function StaffLanguageSelect({
  className = "",
  label,
  locale,
  onLocaleChange,
  variant,
}: Readonly<{
  className?: string;
  label: string;
  locale: Locale;
  onLocaleChange: (locale: Locale) => void;
  variant: StaffLanguageSwitcherVariant;
}>) {
  function changeLocale(event: ChangeEvent<HTMLSelectElement>) {
    if (isSupportedLocale(event.target.value)) onLocaleChange(event.target.value);
  }

  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <label htmlFor={`staff-language-${variant}`} className="sr-only">{label}</label>
      <select
        id={`staff-language-${variant}`}
        value={locale}
        onChange={changeLocale}
        aria-label={label}
        className={`min-h-11 w-full min-w-0 rounded-lg border px-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none ${selectVariantClasses[variant]}`}
      >
        {staffLanguageOptions.map((option) => (
          <option key={option.locale} value={option.locale} lang={option.locale} dir={getLocaleDirection(option.locale)} className="bg-white text-stone-950">
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StaffLanguageSwitcher({
  className,
  label,
  locale,
  variant,
}: Readonly<{
  className?: string;
  label: string;
  locale: Locale;
  variant: StaffLanguageSwitcherVariant;
}>) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  return (
    <StaffLanguageSelect
      className={className}
      label={label}
      locale={locale}
      variant={variant}
      onLocaleChange={(nextLocale) => navigateToStaffLocale(router, nextLocale, pathname, searchParams.toString())}
    />
  );
}
