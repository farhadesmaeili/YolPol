import {describe, expect, it} from "vitest";
import {createExportLogisticsMetadata} from "@/features/export-logistics/presentation/seo/logistics-metadata";
import {supportedLocales} from "@/shared/types/locale";

describe("Export Logistics metadata", () => {
  it.each(supportedLocales)("creates canonical, four alternates and x-default for %s", (locale) => {
    const metadata = createExportLogisticsMetadata(locale);
    expect(metadata.alternates?.canonical).toBe(`https://yolpol.com/${locale}/export-logistics`);
    expect(metadata.alternates?.languages).toMatchObject({en: expect.any(String), tr: expect.any(String), fa: expect.any(String), ar: expect.any(String), "x-default": "https://yolpol.com/en/export-logistics"});
    expect(metadata.openGraph).toMatchObject({url: `https://yolpol.com/${locale}/export-logistics`});
  });
});
