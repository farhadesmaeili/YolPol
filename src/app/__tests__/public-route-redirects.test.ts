import {describe, expect, it} from "vitest";

import {legacyExportLogisticsRedirects} from "../../../next.config";
import {supportedLocales} from "@/shared/types/locale";

describe("legacy public route redirects", () => {
  it("permanently redirects exactly the four localized Export Logistics URLs", () => {
    expect(legacyExportLogisticsRedirects).toEqual(
      supportedLocales.map((locale) => ({
        source: `/${locale}/export-logistics`,
        destination: `/${locale}/wholesale-process`,
        permanent: true,
      })),
    );
    expect(new Set(legacyExportLogisticsRedirects.map(({source}) => source)).size).toBe(4);
  });
});
