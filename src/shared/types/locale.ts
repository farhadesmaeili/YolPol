export const supportedLocales = ["en", "tr", "fa", "ar"] as const;

export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = "en";

const supportedLocaleSet: ReadonlySet<string> = new Set(supportedLocales);

export function isSupportedLocale(value: string): value is Locale {
  return supportedLocaleSet.has(value);
}
