import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {getAllowedNextDevelopmentHosts} from "./src/shared/config/inquiry-development";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: [...getAllowedNextDevelopmentHosts()],
};

export default withNextIntl(nextConfig);
