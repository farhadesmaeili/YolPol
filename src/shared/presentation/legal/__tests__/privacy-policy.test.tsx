import {renderToStaticMarkup} from "react-dom/server";
import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";
import {privacyPolicy, siteConfig} from "@/shared/config/site";
import {PrivacyPolicy} from "@/shared/presentation/legal/privacy-policy";

const locales = {en, tr, fa, ar} as const;
const destinationInventory = {
  en: {required: ["Your country and city", "destination country and city"], forbidden: ["destination text", "free-form destination", "destination description"]},
  tr: {required: ["Ülkeniz ve şehriniz", "varış ülkesi ve varış şehri"], forbidden: ["varış metni", "serbest biçimli varış", "varış açıklaması"]},
  fa: {required: ["کشور و شهر شما", "کشور و شهر مقصد"], forbidden: ["متن مقصد", "مقصد آزاد", "توضیح مقصد"]},
  ar: {required: ["دولتك ومدينتك", "دولة الوجهة ومدينتها"], forbidden: ["نص وجهة", "وجهة حرة", "وصف الوجهة"]},
} as const;

describe("localized Privacy Policy", () => {
  it.each(Object.entries(locales))("renders material sections and stable facts for %s", (locale, messages) => {
    const html = renderToStaticMarkup(<PrivacyPolicy locale={locale as keyof typeof locales} />);
    expect(html).toContain(`<h1`);
    expect((html.match(/<h1/gu) ?? [])).toHaveLength(1);
    expect(html).toContain(messages.PrivacyPage.controller.heading);
    expect(html).toContain(messages.PrivacyPage.inquiryLimitation.heading);
    expect(html).toContain(messages.PrivacyPage.securityMetadata.heading);
    expect(html).toContain(messages.PrivacyPage.analytics.heading);
    expect(html).toContain(messages.PrivacyPage.choices.heading);
    expect(html).toContain(privacyPolicy.operator);
    expect(html).toContain(privacyPolicy.publicLocation);
    expect(html).toContain(`href="${siteConfig.contact.emailHref}"`);
    expect(html).toContain(`<bdi dir="ltr"`);
    expect(html).toContain(`<time dateTime="${privacyPolicy.lastUpdated}"`);
  });

  it("states approved retention, security, current limitation, cookie, and analytics facts", () => {
    const policy = JSON.stringify(en.PrivacyPage);
    expect(policy).toContain("up to 24 months");
    expect(policy).toContain("up to 30 days");
    expect(policy).toContain("does not necessarily make an IP address anonymous");
    expect(policy).toContain("Secure online submission is not active");
    expect(policy).toContain("NEXT_LOCALE");
    expect(policy).toContain("No website analytics platform is currently active");
    expect(policy).toContain("Self-hosted Umami is the preferred future");
  });

  it("keeps equivalent policy and consent key structures in every locale", () => {
    const shape = (value: unknown): string => typeof value !== "object" || value === null ? typeof value : Object.keys(value).sort().map((key) => `${key}:${shape((value as Record<string, unknown>)[key])}`).join("|");
    expect(new Set(Object.values(locales).map(({PrivacyPage}) => shape(PrivacyPage))).size).toBe(1);
    expect(new Set(Object.values(locales).map(({InquiryConsent}) => shape(InquiryConsent))).size).toBe(1);
  });

  it.each(Object.entries(locales))("discloses only contract-owned destination fields for %s", (locale, messages) => {
    const provided = messages.PrivacyPage.information.provided;
    expect(Object.keys(provided).sort()).toEqual(["contact", "context", "location", "request"]);
    for (const term of destinationInventory[locale as keyof typeof destinationInventory].required) expect(provided.location).toContain(term);
    for (const term of destinationInventory[locale as keyof typeof destinationInventory].forbidden) expect(provided.location.toLocaleLowerCase(locale)).not.toContain(term.toLocaleLowerCase(locale));
    for (const disclosure of Object.values(provided)) expect(disclosure.trim()).not.toBe("");
  });

  it("contains no prohibited legal claims or active tracker implementation", () => {
    const publicCopy = JSON.stringify(Object.values(locales).map(({PrivacyPage}) => PrivacyPage));
    expect(publicCopy).not.toMatch(/GDPR compliant|CCPA compliant|Data Protection Officer|registered company|registration number|ISO certified|completely anonymous|absolute security/iu);
    const sources = ["src/app/[locale]/privacy/page.tsx", "src/shared/presentation/legal/privacy-policy.tsx", "src/app/[locale]/inquiry/page.tsx"].map((path) => readFileSync(path, "utf8")).join("\n");
    expect(sources).not.toMatch(/gtag\(|googletagmanager|analytics\.js|umami\.is|data-website-id/iu);
    expect(readFileSync("src/features/inquiries/presentation/components/inquiry-form.tsx", "utf8")).not.toMatch(/i18n\/messages|\.json["']/u);
  });
});
