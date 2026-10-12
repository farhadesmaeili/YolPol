import {readFileSync} from "node:fs";
import {join} from "node:path";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import type {ListStaffDiscoveryResult} from "@/features/customer-acquisition/application/use-cases/list-staff-discovery-candidates";
import {syntheticReviewCandidate} from "@/features/customer-acquisition/testing/fakes/staff-discovery-reader";
import ar from "@/i18n/messages/ar.json";
import en from "@/i18n/messages/en.json";
import fa from "@/i18n/messages/fa.json";
import tr from "@/i18n/messages/tr.json";
import {getLocaleDirection} from "@/i18n/locale";

const messages = {en, tr, fa, ar};
vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: keyof typeof messages; namespace: "StaffDiscovery"}) =>
    (key: string, values?: Record<string, string>) => {
      const value = key.split(".").reduce<unknown>((current, part) => typeof current === "object" && current !== null ? (current as Record<string, unknown>)[part] : undefined, messages[locale][namespace]);
      if (typeof value !== "string") throw new Error(`Missing translation: ${locale}.${namespace}.${key}`);
      return Object.entries(values ?? {}).reduce((text, [name, replacement]) => text.replace(`{${name}}`, replacement), value);
    },
}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));

import {StaffDiscoveryList} from "@/features/customer-acquisition/presentation/components/staff-discovery-list";

const available = (candidates: ReturnType<typeof syntheticReviewCandidate>[], nextCursor: string | null = null): ListStaffDiscoveryResult =>
  ({status: "available", page: {candidates, nextCursor}});

describe("Staff discovery presentation", () => {
  it.each(["en", "tr", "fa", "ar"] as const)("renders localized unconfigured and empty states in %s", async (locale) => {
    const unavailable = renderToStaticMarkup(await StaffDiscoveryList({locale, result: {status: "unavailable", reason: "unconfigured"}}));
    const empty = renderToStaticMarkup(await StaffDiscoveryList({locale, result: available([])}));
    expect(unavailable).toContain(messages[locale].StaffDiscovery.unconfiguredTitle);
    expect(empty).toContain(messages[locale].StaffDiscovery.emptyTitle);
    expect(unavailable).not.toContain(messages[locale].StaffDiscovery.emptyTitle);
    expect(unavailable).toContain('role="status"');
  });

  it.each(["en", "tr", "fa", "ar"] as const)("renders populated candidates and direction semantics in %s", async (locale) => {
    const html = renderToStaticMarkup(await StaffDiscoveryList({locale, result: available([syntheticReviewCandidate()])}));
    expect(html).toContain(messages[locale].StaffDiscovery.title);
    expect(html).toContain(messages[locale].StaffDiscovery.evidenceKinds.WEBSITE);
    expect(html).toContain(messages[locale].StaffDiscovery.identityKinds.POSSIBLE_NAME_MATCH);
    expect(html).toContain('dir="ltr"');
    expect(getLocaleDirection(locale)).toBe(locale === "fa" || locale === "ar" ? "rtl" : "ltr");
  });

  it.each([
    {locale: "fa", source: "منبع", observed: "مشاهده‌شده", website: "وب‌سایت", segment: "بخش", packaging: "بسته‌بندی", supports: "تأیید می‌کند", contradicts: "رد می‌کند", unknown: "یافته نامشخص"},
    {locale: "en", source: "Source", observed: "Observed", website: "Website", segment: "Segment", packaging: "Packaging", supports: "Supports", contradicts: "Contradicts", unknown: "Unknown finding"},
    {locale: "tr", source: "Kaynak", observed: "Gözlemlendi", website: "Web sitesi", segment: "Segment", packaging: "Ambalaj", supports: "Destekliyor", contradicts: "Çelişiyor", unknown: "Bilinmeyen bulgu"},
    {locale: "ar", source: "المصدر", observed: "تم رصده", website: "موقع الويب", segment: "القطاع", packaging: "التغليف", supports: "يدعم", contradicts: "يتعارض", unknown: "نتيجة غير معروفة"},
  ] as const)("renders evidence semantics in $locale", async ({locale, source, observed, website, segment, packaging, supports, contradicts, unknown}) => {
    const candidate = syntheticReviewCandidate(3, {evidence: [
      {id: "source", kind: "SOURCE", finding: "OBSERVED", url: "https://source.example/company-3", reference: "source", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "website-support", kind: "WEBSITE", finding: "SUPPORTS", url: "https://source.example/company-3", reference: "website-support", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "website-contradiction", kind: "WEBSITE", finding: "CONTRADICTS", url: "https://source.example/company-3", reference: "website-contradiction", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "segment", kind: "SEGMENT", finding: "SUPPORTS", url: "https://source.example/company-3", reference: "segment", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "packaging", kind: "PACKAGING", finding: "CONTRADICTS", url: "https://source.example/company-3", reference: "packaging", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "unknown", kind: "WEBSITE", finding: "UNEXPECTED", url: "https://source.example/company-3", reference: "unknown", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "unexpected-source", kind: "SOURCE", finding: "SUPPORTS", url: "https://source.example/company-3", reference: "unexpected-source", observedAt: "2026-10-09T00:00:00.000Z"},
      {id: "unexpected-observation", kind: "WEBSITE", finding: "OBSERVED", url: "https://source.example/company-3", reference: "unexpected-observation", observedAt: "2026-10-09T00:00:00.000Z"},
    ]});
    const html = renderToStaticMarkup(await StaffDiscoveryList({locale, result: available([candidate])}));

    for (const label of [
      `${source} · ${observed}`,
      `${website} · ${supports}`,
      `${website} · ${contradicts}`,
      `${segment} · ${supports}`,
      `${packaging} · ${contradicts}`,
      `${website} · ${unknown}`,
      `${source} · ${unknown}`,
    ]) expect(html).toContain(`<li>${label}</li>`);
    expect(html).not.toContain(`<li>${source} · ${contradicts}</li>`);
  });

  it("shows historical approval separately from expired current eligibility and candidate summaries", async () => {
    const candidate = syntheticReviewCandidate(1, {name: "<Synthetic & Co>", state: "APPROVED", expired: true, eligibility: {contract: "authorization-time-v1", evaluatedAt: "2026-10-16T00:00:00.000Z", status: "EXPIRED"}});
    const html = renderToStaticMarkup(await StaffDiscoveryList({locale: "en", result: available([candidate], "synthetic next")}));
    expect(html).toContain("Approved historically");
    expect(html).toContain("Expired now");
    expect(html).toContain("Evidence records: 3");
    expect(html).toContain("Findings: 1");
    expect(html).toContain("Unresolved: 1");
    expect(html).toContain("Website · Supports");
    expect(html).toContain("Source · Observed");
    expect(html).toContain("Website · Contradicts");
    expect(html).toContain("Possible name match · Unresolved");
    expect(html).toContain("bottler-1.example");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("cursor=synthetic%20next");
    expect(html).toContain("sm:grid-cols-2");
    expect(html).toContain("&lt;Synthetic &amp; Co&gt;");
    expect(html).not.toMatch(/<button|source activation|credential/i);
  });

  it.each(["CURRENTLY_APPROVED", "POLICY_DENIED", "SUPPRESSED", "IDENTITY_CONFLICT", "EVIDENCE_REQUIRED"] as const)("renders %s as current eligibility", async (status) => {
    const candidate = syntheticReviewCandidate(2, {eligibility: {contract: "authorization-time-v1", evaluatedAt: "2026-10-10T00:00:00.000Z", status}});
    const html = renderToStaticMarkup(await StaffDiscoveryList({locale: "en", result: available([candidate])}));
    expect(html).toContain(en.StaffDiscovery.eligibility[status]);
  });

  it("keeps the direct route guarded and private", () => {
    const root = join(process.cwd(), "src", "app", "[locale]", "staff");
    const page = readFileSync(join(root, "(protected)", "acquisition", "page.tsx"), "utf8");
    const layout = readFileSync(join(root, "layout.tsx"), "utf8");
    expect(page.indexOf("mayViewDiscoveryCandidates")).toBeLessThan(page.indexOf("getStaffDiscoveryCandidates().execute"));
    expect(page).toContain('access.status !== "authorized"');
    expect(layout).toContain('dynamic = "force-dynamic"');
    expect(layout).toContain('revalidate = 0');
    expect(layout).toContain('robots: {index: false, follow: false, nocache: true}');
  });
});
