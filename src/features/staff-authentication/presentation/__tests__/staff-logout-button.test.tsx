import {readFileSync} from "node:fs";
import {join} from "node:path";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));

import {
  StaffLogoutButtonPresentation,
  type StaffLogoutButtonVariant,
} from "@/features/staff-authentication/presentation/components/staff-logout-button";

const labels = {logout: "Log out", loggingOut: "Logging out", error: "Logout failed"};

function renderVariant(variant: StaffLogoutButtonVariant, failed = false): string {
  return renderToStaticMarkup(
    <StaffLogoutButtonPresentation
      variant={variant}
      labels={labels}
      submitting={false}
      failed={failed}
      onLogout={() => undefined}
    />,
  );
}

describe("StaffLogoutButton visual variants", () => {
  it("uses a readable dark-surface treatment for the desktop sidebar", () => {
    const html = renderVariant("dark");
    expect(html).toContain("border-white/20");
    expect(html).toContain("bg-white/5");
    expect(html).toContain("text-white");
    expect(html).toContain("hover:bg-white/10");
    expect(html).toContain("focus-visible:ring-emerald-300");
  });

  it("uses a contrasting light-surface treatment for the mobile header", () => {
    const html = renderVariant("light");
    expect(html).toContain("border-stone-300");
    expect(html).toContain("bg-white");
    expect(html).toContain("text-stone-800");
    expect(html).toContain("hover:bg-stone-50");
    expect(html).toContain("focus-visible:ring-emerald-700");
    expect(html).not.toContain("border-white/20");
    expect(html).not.toContain("text-white");
  });

  it.each([
    ["dark", "text-red-200"],
    ["light", "text-red-700"],
  ] as const)("keeps the %s failure state accessible and surface-appropriate", (variant, errorClass) => {
    const html = renderVariant(variant, true);
    expect(html).toContain('role="alert"');
    expect(html).toContain(errorClass);
    expect(html).toContain("break-words");
    expect(html).toContain("Logout failed");
  });

  it("preserves native button, touch-target, focus, loading, and reduced-motion semantics", () => {
    const html = renderVariant("light");
    expect(html).toContain('type="button"');
    expect(html).toContain("min-h-11");
    expect(html).toContain("focus-visible:ring-2");
    expect(html).toContain("disabled:cursor-wait");
    expect(html).toContain("motion-reduce:transition-none");
  });

  it("keeps exactly one logout request implementation", () => {
    const source = readFileSync(join(process.cwd(), "src", "features", "staff-authentication", "presentation", "components", "staff-logout-button.tsx"), "utf8");
    expect(source.match(/submitStaffLogout\(fetch\)/gu)).toHaveLength(1);
    expect(source).toContain('router.replace("/staff/login")');
    expect(source).toContain("router.refresh()");
  });
});
