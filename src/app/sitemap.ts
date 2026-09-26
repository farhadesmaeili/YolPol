import type {MetadataRoute} from "next";

import {listPublicIndexableSitemapEntries} from "@/composition/seo/public-indexable-pages";
import {searchIndexingEnabled} from "@/shared/config/deployment-environment";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!searchIndexingEnabled()) return [];
  return listPublicIndexableSitemapEntries();
}
