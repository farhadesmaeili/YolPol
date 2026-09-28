import {isSupportedLocale} from "@/shared/types/locale";

const publicStaticSegments = new Set([
  "about",
  "contact",
  "inquiry",
  "privacy",
  "products",
  "wholesale-process",
]);

const productSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isPublicAnalyticsPathname(pathname: string): boolean {
  if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#")) {
    return false;
  }

  const segments = pathname.split("/");
  const locale = segments[1];
  if (segments[0] !== "" || !locale || !isSupportedLocale(locale)) return false;
  if (segments.length === 2) return true;
  if (segments.length === 3) return publicStaticSegments.has(segments[2] ?? "");

  const productSlug = segments[3] ?? "";
  return segments.length === 4
    && segments[2] === "products"
    && productSlug.length <= 120
    && productSlugPattern.test(productSlug);
}
