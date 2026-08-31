import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe,expect,it} from "vitest";

import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";
import {privacyPolicy,siteConfig} from "@/shared/config/site";
import {PrivacyPolicy} from "@/shared/presentation/legal/privacy-policy";

const locales={en,tr,fa,ar} as const;
const htmlText=(value:string)=>value.replaceAll("'","&#x27;");

describe("localized Privacy Policy",()=>{
  it.each(Object.entries(locales))("renders the active processing inventory for %s",(locale,messages)=>{
    const html=renderToStaticMarkup(<PrivacyPolicy locale={locale as keyof typeof locales}/>);
    expect((html.match(/<h1/gu)??[])).toHaveLength(1);
    expect(html).toContain(messages.ActiveInquiryPrivacy.heading);
    expect(html).toContain(messages.InquiryPrivacyInventory.heading);
    for(const section of [messages.InquiryPrivacyInventory.customer,messages.InquiryPrivacyInventory.product,messages.InquiryPrivacyInventory.evidence]) for(const disclosure of Object.values(section)) expect(html).toContain(htmlText(disclosure));
    expect(html).toContain(privacyPolicy.publicName); expect(html).toContain(siteConfig.contact.location.summary[locale as keyof typeof locales]);
    expect(html).toContain(`href="${siteConfig.contact.emailHref}"`); expect(html).toContain(`<time dateTime="${privacyPolicy.lastUpdated}"`);
  });
  it("states storage, enforced retention policy, absent metadata, cookies, and analytics accurately",()=>{
    const policy=JSON.stringify({privacy:en.PrivacyPage,active:en.ActiveInquiryPrivacy,inventory:en.InquiryPrivacyInventory});
    expect(policy).toContain("securely transmitted"); expect(policy).toContain("up to 24 months"); expect(policy).toContain("does not currently collect separate IP-address");
    expect(policy).toContain("internal operational notifications"); expect(policy).toContain("Telegram"); expect(policy).toContain("third-party communication infrastructure");
    expect(policy).toContain("NEXT_LOCALE"); expect(policy).toContain("No website analytics platform is currently active");
  });
  it("keeps equivalent active policy structures in every locale",()=>{
    const shape=(value:unknown):string=>typeof value!=="object"||value===null?typeof value:Object.keys(value).sort().map(key=>`${key}:${shape((value as Record<string,unknown>)[key])}`).join("|");
    for(const key of ["PrivacyPage","InquiryConsent","ActiveInquiryPrivacy","InquiryPrivacyInventory"] as const) expect(new Set(Object.values(locales).map(messages=>shape(messages[key]))).size).toBe(1);
  });
  it.each(Object.entries(locales))("discloses only active contract fields for %s",(_locale,messages)=>{
    const disclosure=JSON.stringify(messages.InquiryPrivacyInventory);
    expect(disclosure).toMatch(/email|e-posta|ایمیل|البريد/iu); expect(disclosure).toContain("SKU");
    expect(disclosure).not.toMatch(/payment|shipping price|full IP|User-Agent|destination text/iu);
  });
  it("contains no stale inactive-submission or prohibited legal claims",()=>{
    const publicCopy=JSON.stringify(Object.values(locales));
    expect(publicCopy).not.toMatch(/submission is not active|submission is unavailable|does not persist|only locally|secure online submission is not active/iu);
    expect(publicCopy).not.toMatch(/does not (?:send|generate)[^.]*Telegram/iu);
    expect(publicCopy).not.toMatch(/GDPR compliant|CCPA compliant|Data Protection Officer|registered company|ISO certified|absolute security/iu);
    const sources=["src/app/[locale]/privacy/page.tsx","src/shared/presentation/legal/privacy-policy.tsx","src/app/[locale]/inquiry/page.tsx"].map(path=>readFileSync(path,"utf8")).join("\n");
    expect(sources).not.toMatch(/gtag\(|googletagmanager|analytics\.js|umami\.is|data-website-id/iu);
    expect(readFileSync("src/features/inquiries/presentation/components/inquiry-form.tsx","utf8")).not.toMatch(/i18n\/messages|\.json["']/u);
  });
});
