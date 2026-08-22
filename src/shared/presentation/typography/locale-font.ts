import type {Locale} from "@/shared/types/locale";

export const localeFontClass = {
  en: "font-sans",
  tr: "font-sans",
  fa: "font-brand-persian",
  ar: "font-brand-arabic",
} as const satisfies Record<Locale, string>;

export function getLocaleFontClass(locale: Locale) {
  return localeFontClass[locale];
}
