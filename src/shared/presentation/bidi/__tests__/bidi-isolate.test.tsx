import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {formatHumanNumber, LtrIsolate, NumberUnit} from "@/shared/presentation/bidi/bidi-isolate";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import {siteConfig} from "@/shared/config/site";

describe("bidi presentation primitives", () => {
  it.each(["+98 912 394 5674", "+98 912 122 1942", "yolpol@gmail.com", "YLP-250-01"])('isolates canonical LTR value %s', (value) => expect(renderToStaticMarkup(<LtrIsolate>{value}</LtrIsolate>)).toContain(`<bdi dir="ltr"`));
  it("formats human numbers with the active locale", () => {
    expect(formatHumanNumber("en", 26000)).toBe("26,000");
    expect(formatHumanNumber("tr", 26000)).toBe("26.000");
    expect(formatHumanNumber("fa", 26000)).toMatch(/[۰-۹]/u);
    expect(formatHumanNumber("ar", 26000)).toMatch(/[٠-٩]/u);
  });
  it.each(["en", "tr", "fa", "ar"] as const)("uses a neutral fallback for non-finite %s numbers", (locale) => {
    expect(formatHumanNumber(locale, Number.NaN)).toBe("—");
    expect(formatHumanNumber(locale, Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatHumanNumber(locale, Number.NEGATIVE_INFINITY)).toBe("—");
  });
  it("keeps a formatted number and unit in one isolated group", () => expect(renderToStaticMarkup(<NumberUnit locale="fa" value={925} unit="kg" />)).toContain("unicode-bidi:isolate"));
  it("preserves canonical contact and technical values", () => { expect(siteConfig.contact.phones.map(({href}) => href)).toEqual(["tel:+989123945674", "tel:+989121221942"]); expect(siteConfig.contact.whatsapp.href).toBe("https://wa.me/989123945674"); expect(renderToStaticMarkup(<LtrIsolate>YLP-GB-250-01</LtrIsolate>)).toContain("YLP-GB-250-01"); });
  it("contains no embedded bidi control characters in messages or contact configuration", () => expect(JSON.stringify({enMessages,trMessages,faMessages,arMessages,siteConfig})).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/u));
});
