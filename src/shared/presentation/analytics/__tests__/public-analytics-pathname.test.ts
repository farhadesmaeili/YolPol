import {describe, expect, it} from "vitest";

import {isPublicAnalyticsPathname} from "@/shared/presentation/analytics/public-analytics-pathname";

describe("public analytics pathname policy", () => {
  it.each([
    "/en", "/fa", "/tr", "/ar",
    "/en/about", "/fa/contact", "/tr/inquiry", "/ar/privacy",
    "/en/products", "/en/products/example-product", "/fa/products/olive-oil",
    "/ar/wholesale-process",
  ])("allows the known public route %s", (pathname) => {
    expect(isPublicAnalyticsPathname(pathname)).toBe(true);
  });

  it.each([
    "/en/staff",
    "/en/staff/login",
    "/en/staff/activate",
    "/en/staff/inquiries/abc123",
    "/fa/staff/ai-operations",
    "/tr/staff/team",
    "/ar/staff/translation-settings",
    "/de",
    "/EN/about",
    "/en/unknown-private-route",
    "/en/products/not/a-product",
    "/en/products/Invalid-Slug",
    `/en/products/${"a".repeat(121)}`,
    "/api/analytics/config",
    "en/about",
    "/en/about/",
    "/en/inquiry?email=private@example.com",
    "/en/inquiry#private",
  ])("rejects the non-public or malformed route %s", (pathname) => {
    expect(isPublicAnalyticsPathname(pathname)).toBe(false);
  });
});
