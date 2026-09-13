import {isSupportedLocale, type Locale} from "@/shared/types/locale";

// Called only after existing Origin and capability checks. No locale JSON field.
export function customerWebsiteLocale(request: Request): Readonly<{sourceLocale?: Locale}> {
  const referer = request.headers.get("referer");
  if (!referer) return {};
  try {
    const page = new URL(referer);
    const origin = request.headers.get("origin") ?? new URL(request.url).origin;
    if (page.origin !== origin || page.username || page.password) return {};
    const locale = page.pathname.split("/")[1] ?? "";
    if (!isSupportedLocale(locale) || page.pathname.split("/")[2] === "staff") return {};
    return {sourceLocale: locale};
  } catch { return {}; }
}
