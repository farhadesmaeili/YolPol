import {readFileSync} from "node:fs";
import {join} from "node:path";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/staff",
  useRouter: () => ({replace: vi.fn()}),
}));

import {
  buildStaffLocaleHref,
  navigateToStaffLocale,
  StaffLanguageSelect,
  staffLanguageOptions,
} from "@/shared/presentation/staff-shell/staff-language-switcher";
import {supportedLocales} from "@/shared/types/locale";

describe("Staff language switcher", () => {
  it("renders exactly the four supported locales with native names and identifies the current locale", () => {
    const html = renderToStaticMarkup(<StaffLanguageSelect locale="en" label="Change language" variant="light" onLocaleChange={() => undefined} />);
    expect(staffLanguageOptions.map(({locale}) => locale)).toEqual([...supportedLocales]);
    for (const name of ["English", "Türkçe", "فارسی", "العربية"]) expect(html).toContain(name);
    expect(html).toMatch(/<option[^>]*value="en"[^>]*selected=""/u);
    expect(html).toContain('aria-label="Change language"');
  });

  it("marks Persian and Arabic options as RTL while English and Turkish remain LTR", () => {
    const html = renderToStaticMarkup(<StaffLanguageSelect locale="fa" label="تغییر زبان" variant="dark" onLocaleChange={() => undefined} />);
    expect(html).toMatch(/<option[^>]*value="fa"[^>]*lang="fa"[^>]*dir="rtl"/u);
    expect(html).toMatch(/<option[^>]*value="ar"[^>]*lang="ar"[^>]*dir="rtl"/u);
    expect(html).toMatch(/<option[^>]*value="en"[^>]*lang="en"[^>]*dir="ltr"/u);
    expect(html).toMatch(/<option[^>]*value="tr"[^>]*lang="tr"[^>]*dir="ltr"/u);
  });

  it("switches an English Inquiry route to the equivalent Persian route through next-intl", () => {
    const router = {replace: vi.fn()};
    navigateToStaffLocale(router, "fa", "/staff/inquiries", "");
    expect(router.replace).toHaveBeenCalledWith("/staff/inquiries", {locale: "fa"});
  });

  it("preserves the Inquiry ID when switching a detail route to Turkish", () => {
    const router = {replace: vi.fn()};
    navigateToStaffLocale(router, "tr", "/staff/inquiries/abc-123", "");
    expect(router.replace).toHaveBeenCalledWith("/staff/inquiries/abc-123", {locale: "tr"});
  });

  it("preserves list filters and an opaque cursor without interpreting them", () => {
    const query = "status=NEW&assignment=__unassigned&cursor=opaque%7Ecursor%2Fpart";
    expect(buildStaffLocaleHref("/staff/inquiries", query)).toBe(`/staff/inquiries?${query}`);
    const router = {replace: vi.fn()};
    navigateToStaffLocale(router, "fa", "/staff/inquiries", query);
    expect(router.replace).toHaveBeenCalledWith(`/staff/inquiries?${query}`, {locale: "fa"});
  });

  it("preserves the Staff Login route before authentication", () => {
    const router = {replace: vi.fn()};
    navigateToStaffLocale(router, "fa", "/staff/login", "");
    expect(router.replace).toHaveBeenCalledWith("/staff/login", {locale: "fa"});
  });

  it("does not call authentication APIs or store authentication/session state", () => {
    const source = readFileSync(join(process.cwd(), "src", "shared", "presentation", "staff-shell", "staff-language-switcher.tsx"), "utf8");
    expect(source).not.toMatch(/submitStaffLogin|submitStaffLogout|\/api\/staff|localStorage|sessionStorage|indexedDB|document\.cookie|window\.location/u);
    expect(source).toContain("router.replace");
  });

  it("is rendered by the Staff Login page without changing its server-rendered architecture", () => {
    const source = readFileSync(join(process.cwd(), "src", "app", "[locale]", "staff", "login", "page.tsx"), "utf8");
    expect(source).toContain("<StaffLanguageSwitcher");
    expect(source).toContain('variant="light"');
    expect(source).not.toMatch(/suppressHydrationWarning|useEffect|mounted/u);
  });
});
