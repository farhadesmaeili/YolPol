import {describe, expect, it} from "vitest";
import {customerWebsiteLocale} from "@/features/conversation-translation/infrastructure/http/customer-website-locale";

describe("Website source locale context", () => {
  it("accepts supported same-origin public route context only", () => {
    for (const locale of ["fa", "en", "tr", "ar"]) expect(customerWebsiteLocale(new Request("https://example.com/api/customer/conversation/messages", {headers: {origin: "https://example.com", referer: `https://example.com/${locale}/inquiry`}}))).toEqual({sourceLocale: locale});
    for (const referer of ["https://evil.example/ar", "https://example.com/de", "https://example.com/fa/staff", "bad"]) expect(customerWebsiteLocale(new Request("https://example.com/api/customer/conversation/messages", {headers: {origin: "https://example.com", referer}}))).toEqual({});
    expect(customerWebsiteLocale(new Request("https://example.com/api/customer/conversation/messages"))).toEqual({});
  });
});
