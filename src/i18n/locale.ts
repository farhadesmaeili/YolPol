import {hasLocale} from "next-intl";

import {routing, type Locale} from "@/i18n/routing";

const rtlLocales: ReadonlySet<Locale> = new Set(["fa", "ar"]);

export function isLocale(value: string): value is Locale {
  return hasLocale(routing.locales, value);
}

export function getLocaleDirection(locale: Locale): "ltr" | "rtl" {
  return rtlLocales.has(locale) ? "rtl" : "ltr";
}
