import type {MetadataRoute} from "next";

import {siteConfig} from "@/shared/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {userAgent: "*", allow: "/"},
    sitemap: new URL("/sitemap.xml", siteConfig.url).toString(),
  };
}
