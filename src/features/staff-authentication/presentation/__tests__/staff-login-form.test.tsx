import {readFileSync} from "node:fs";
import {join} from "node:path";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {
  StaffLoginForm,
  StaffPasswordField,
  togglePasswordVisibility,
  type StaffLoginLabels,
} from "@/features/staff-authentication/presentation/components/staff-login-form";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}),
}));

const labels: StaffLoginLabels = {
  email: "Email",
  emailPlaceholder: "staff@example.com",
  error: "Authentication failed",
  hidePassword: "Hide password",
  password: "Password",
  showPassword: "Show password",
  signIn: "Sign in",
  signingIn: "Signing in",
};

function renderPasswordField(passwordVisible: boolean): string {
  return renderToStaticMarkup(
    <StaffPasswordField labels={labels} passwordVisible={passwordVisible} onToggle={() => undefined} />,
  );
}

describe("Staff Login password visibility", () => {
  it("starts hidden with an accessible non-submit Show password control", () => {
    const html = renderToStaticMarkup(<StaffLoginForm labels={labels} />);
    expect(html).toContain('id="staff-password"');
    expect(html).toContain('type="password"');
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('<svg aria-hidden="true"');
  });

  it("switches to visible state with the Hide password label", () => {
    const visible = togglePasswordVisibility(false);
    const html = renderPasswordField(visible);
    expect(visible).toBe(true);
    expect(html).toContain('type="text"');
    expect(html).toContain('aria-label="Hide password"');
    expect(html).toContain('aria-pressed="true"');
  });

  it("switches back to password mode on the next activation", () => {
    const visible = togglePasswordVisibility(togglePasswordVisibility(false));
    const html = renderPasswordField(visible);
    expect(visible).toBe(false);
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-label="Show password"');
  });

  it("changes only visibility state, preserving the uncontrolled password input value", () => {
    const passwordValue = "temporary-password-value";
    let visible = false;
    visible = togglePasswordVisibility(visible);
    visible = togglePasswordVisibility(visible);
    expect(visible).toBe(false);
    expect(passwordValue).toBe("temporary-password-value");

    const source = readFileSync(join(process.cwd(), "src", "features", "staff-authentication", "presentation", "components", "staff-login-form.tsx"), "utf8");
    expect(source).toContain("useState(false)");
    expect(source).not.toMatch(/value=\{.*password|defaultValue=\{.*password|setPassword\(/u);
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/u);
  });

  it("uses logical-end positioning with RTL-aware reserved input padding", () => {
    const html = renderPasswordField(false);
    expect(html).toContain("end-1.5");
    expect(html).toContain("ltr:pe-14");
    expect(html).toContain("rtl:ps-14");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain("size-11");
    expect(html).toContain("focus-visible:ring-2");
  });
});
