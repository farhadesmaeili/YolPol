import {defineRouting} from "next-intl/routing";

import {
  defaultLocale,
  supportedLocales,
} from "@/shared/types/locale";

export const routing = defineRouting({
  locales: supportedLocales,
  defaultLocale,
  localePrefix: "always",
});

export type {Locale} from "@/shared/types/locale";
