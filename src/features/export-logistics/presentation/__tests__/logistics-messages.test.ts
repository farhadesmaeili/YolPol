import {describe, expect, it} from "vitest";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";

const messages = {en, tr, fa, ar} as const;

describe("Export Logistics messages", () => {
  it("keeps identical Export Logistics key paths", () => {
    const expected = leafPaths(en.ExportLogistics);
    for (const locale of ["tr", "fa", "ar"] as const) expect(leafPaths(messages[locale].ExportLogistics)).toEqual(expected);
  });
  it.each([
    ["en", "Wholesale Process", "kg", "Transportation is arranged by the buyer."],
    ["tr", "Toptan Sipariş Süreci", "kg", "Taşımacılığı alıcı ayarlar."],
    ["fa", "فرآیند سفارش عمده", "کیلوگرم", "حمل‌ونقل را خریدار هماهنگ می‌کند."],
    ["ar", "آلية طلبات الجملة", "كغ", "يرتب المشتري النقل."],
  ] as const)("owns wholesale navigation, units, and equivalent buyer-arranged transport detail in %s", (locale, navigation, kilograms, buyerArrangedTransport) => {
    expect(messages[locale].SiteShell.navigation["wholesale-process"]).toBe(navigation);
    expect(messages[locale].ExportLogistics.calculator.kilograms).toBe(kilograms);
    expect(Object.keys(messages[locale].ExportLogistics.workflow.steps)).toHaveLength(10);
    expect(messages[locale].ExportLogistics.workflow.steps["8"]).not.toBe(messages[locale].ExportLogistics.workflow.steps["9"]);
    expect(messages[locale].ExportLogistics.calculator.disclaimer).toContain(buyerArrangedTransport);
    expect(messages[locale].HomePage.transportationNote).toContain(buyerArrangedTransport);
    expect(messages[locale].ExportLogistics.calculator.disclaimer.length).toBeGreaterThan(200);
    expect(messages[locale].ExportLogistics.calculator.maximum.toLocaleLowerCase(locale)).not.toMatch(/maximum|maximumum|حداکثر|الأقصى/u);
  });

  it("does not retain the retired public navigation key", () => {
    for (const locale of ["en", "tr", "fa", "ar"] as const) {
      expect(messages[locale].SiteShell.navigation).not.toHaveProperty("export-logistics");
    }
  });
});

function leafPaths(value: unknown, prefix = ""): readonly string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key)).sort();
}
