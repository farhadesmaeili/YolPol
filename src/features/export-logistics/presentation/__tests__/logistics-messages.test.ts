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
    ["en", "Export Logistics", "kg", "The buyer begins payment.", "The truck is released only after settlement."],
    ["tr", "İhracat Lojistiği", "kg", "Alıcı ödemeyi başlatır.", "Kamyon yalnızca ödeme sonrası serbest bırakılır."],
    ["fa", "لجستیک صادرات", "کیلوگرم", "خریدار پرداخت را آغاز می‌کند.", "کامیون فقط پس از تسویه آزاد می‌شود."],
    ["ar", "لوجستيات التصدير", "كغ", "يبدأ المشتري الدفع.", "لا تغادر الشاحنة إلا بعد التسوية."],
  ] as const)("owns navigation, units, and separate payment steps in %s", (locale, navigation, kilograms, beginsPayment, releasedAfterSettlement) => {
    expect(messages[locale].SiteShell.navigation["export-logistics"]).toBe(navigation);
    expect(messages[locale].ExportLogistics.calculator.kilograms).toBe(kilograms);
    expect(messages[locale].ExportLogistics.workflow.steps["4"]).toBe(beginsPayment);
    expect(messages[locale].ExportLogistics.workflow.steps["5"]).toBe(releasedAfterSettlement);
    expect(beginsPayment).not.toBe(releasedAfterSettlement);
  });
});

function leafPaths(value: unknown, prefix = ""): readonly string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, prefix ? `${prefix}.${key}` : key)).sort();
}
