import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import {getDevelopmentOrigin} from "./src/shared/config/inquiry-development";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");
const developmentOrigin = getDevelopmentOrigin();

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  allowedDevOrigins: developmentOrigin ? [developmentOrigin.host] : [],
};

export default withNextIntl(nextConfig);
