import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";

const messages = {en, tr, fa, ar} as const;
const expectations = {
  en: {wholesale: "wholesale", glass: "glass", buyerTransport: "Transportation is arranged by the buyer."},
  tr: {wholesale: "toptan", glass: "cam", buyerTransport: "Taşımacılığı alıcı ayarlar."},
  fa: {wholesale: "عمده", glass: "شیشه", buyerTransport: "حمل‌ونقل را خریدار هماهنگ می‌کند."},
  ar: {wholesale: "الجملة", glass: "زجاج", buyerTransport: "يرتب المشتري النقل."},
} as const;

describe("four-locale commercial positioning", () => {
  it.each(Object.keys(messages) as Array<keyof typeof messages>)(
    "leads with B2B wholesale while keeping glass catalog copy subordinate in %s",
    (locale) => {
      const localeMessages = messages[locale];
      const expected = expectations[locale];
      const brandCopy = [
        localeMessages.Metadata.title,
        localeMessages.Metadata.description,
        localeMessages.HomePage.description,
        localeMessages.About.introduction,
        localeMessages.SiteShell.footer.description,
      ].join(" ").toLocaleLowerCase(locale);

      expect(brandCopy).toContain(expected.wholesale);
      expect(localeMessages.HomePage.description.toLocaleLowerCase(locale)).not.toContain(expected.glass);
      expect(localeMessages.HomePage.catalog.toLocaleLowerCase(locale)).toContain(expected.glass);
      expect(localeMessages.Products.metadata.title.toLocaleLowerCase(locale)).toContain(expected.glass);
      expect(localeMessages.HomePage.transportationNote).toContain(expected.buyerTransport);
      expect(localeMessages.InquiryPage.form.destination).toBeTruthy();
    },
  );

  it("does not claim a freight, logistics, carrier, transport, or delivery-provider identity", () => {
    const brandCopy = JSON.stringify(
      Object.values(messages).map(({Metadata, HomePage, About, SiteShell}) => ({
        Metadata,
        HomePage,
        About,
        footer: SiteShell.footer,
      })),
    );
    expect(brandCopy).not.toMatch(/freight company|logistics provider|trucking company|carrier company|transport provider|delivery company/iu);
    expect(brandCopy).not.toMatch(/lojistik şirket|nakliye şirket|شرکت لجستیک|شرکت حمل‌ونقل|شركة لوجستيات|شركة نقل/iu);
  });

  it("keeps primary commercial links focused on Inquiry and Wholesale Process", () => {
    const sources = [
      "src/shared/presentation/home/components/home-hero-content.tsx",
      "src/shared/presentation/about/components/about-page.tsx",
      "src/shared/presentation/site-shell/footer/footer-call-to-action.tsx",
      "src/features/export-logistics/presentation/components/export-logistics-page.tsx",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources.match(/href="\/inquiry"/gu)?.length).toBeGreaterThanOrEqual(4);
    expect(sources).toContain('href="/wholesale-process"');
    expect(sources).not.toContain('href="/export-logistics"');
  });
});
