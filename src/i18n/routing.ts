import {defineRouting} from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "tr", "fa", "ar"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
