import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {getAllowedNextDevelopmentHosts} from "./src/shared/config/inquiry-development";
import {supportedLocales} from "./src/shared/types/locale";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
export const legacyExportLogisticsRedirects: Awaited<
  ReturnType<NonNullable<NextConfig["redirects"]>>
> = supportedLocales.map((locale) => ({
  source: `/${locale}/export-logistics`,
  destination: `/${locale}/wholesale-process`,
  permanent: true,
}));

export const baselineSecurityHeaders = Object.freeze([
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
  {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()"},
  {key: "X-Frame-Options", value: "DENY"},
]);

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  allowedDevOrigins: [...getAllowedNextDevelopmentHosts()],
  redirects: () => legacyExportLogisticsRedirects,
  headers: () => [{source: "/:path*", headers: [...baselineSecurityHeaders]}],
};

export default withNextIntl(nextConfig);
