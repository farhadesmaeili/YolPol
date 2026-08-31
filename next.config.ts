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

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [...getAllowedNextDevelopmentHosts()],
  redirects: () => legacyExportLogisticsRedirects,
};

export default withNextIntl(nextConfig);
