import {describe, expect, it} from "vitest";
import {createExportLogisticsMetadata} from "@/features/export-logistics/presentation/seo/logistics-metadata";
import {supportedLocales} from "@/shared/types/locale";

describe("Export Logistics metadata", () => {
  it.each(supportedLocales)("creates canonical, four alternates and x-default for %s", (locale) => {
    const metadata = createExportLogisticsMetadata(locale);
    expect(metadata.alternates?.canonical).toBe(`https://yolpol.com/${locale}/wholesale-process`);
    expect(metadata.alternates?.languages).toEqual({
      en: "https://yolpol.com/en/wholesale-process",
      tr: "https://yolpol.com/tr/wholesale-process",
      fa: "https://yolpol.com/fa/wholesale-process",
      ar: "https://yolpol.com/ar/wholesale-process",
      "x-default": "https://yolpol.com/en/wholesale-process",
    });
    expect(metadata.openGraph).toMatchObject({url: `https://yolpol.com/${locale}/wholesale-process`});
  });
});
