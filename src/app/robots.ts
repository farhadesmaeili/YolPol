import type {MetadataRoute} from "next";

import {searchIndexingEnabled} from "@/shared/config/deployment-environment";
import {siteConfig} from "@/shared/config/site";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) {
    return {rules: {userAgent: "*", disallow: "/"}};
  }

  return {
    rules: {userAgent: "*", allow: "/"},
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
