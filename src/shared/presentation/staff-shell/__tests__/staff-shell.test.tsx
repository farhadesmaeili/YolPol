import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import type {StaffLogoutButtonVariant} from "@/features/staff-authentication/presentation/components/staff-logout-button";
import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: Readonly<{children: ReactNode; href: string}>) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/shared/presentation/staff-shell/staff-navigation", () => ({
  StaffNavigation: () => <nav data-staff-navigation="true" />,
}));

vi.mock("@/features/staff-authentication/presentation/components/staff-logout-button", () => ({
  StaffLogoutButton: ({variant}: Readonly<{variant: StaffLogoutButtonVariant}>) => <span data-logout-variant={variant} />,
}));

vi.mock("@/shared/presentation/staff-shell/staff-language-switcher", () => ({
  StaffLanguageSwitcher: ({locale, variant}: Readonly<{locale: string; variant: string}>) => <span data-language-locale={locale} data-language-variant={variant} />,
}));

import {StaffShell, type StaffShellLabels} from "@/shared/presentation/staff-shell/staff-shell";

const principal: StaffPrincipal = {
  staffAccountId: "account-1",
  teamMemberId: "member-1",
  role: "ADMIN",
  displayName: "Operations Admin",
  actorReference: "staff:member-1",
};

const labels: StaffShellLabels = {
  changeLanguage: "Change language",
  aiOperations: "AI Operations",
  aiProviders: "AI Providers",
  dashboard: "Dashboard",
  inquiries: "Inquiries",
  logout: "Log out",
  logoutError: "Logout failed",
  loggingOut: "Logging out",
  navigation: "Staff navigation",
  operations: "Staff operations",
  role: "Role",
  roles: {SUPER_ADMIN: "Super Administrator", ADMIN: "Administrator", SALES: "Sales", VIEWER: "Viewer"},
  signedInAs: "Signed in as",
  skipToContent: "Skip to content",
  team: "Team",
};

const capabilities = {
  mayAccessStaffPanel: true,
  mayViewInquiries: true,
  mayViewCustomerConversation: true,
  mayReplyToCustomerConversation: true,
  mayPublishStaffTyping: true,
  mayUpdateInquiryWorkflow: true,
  mayViewAiOperations: true,
  mayManageAiOperations: true,
  mayViewAiProviderRegistry: true,
  mayManageAiProviders: true,
  mayManageAiCredentialReferences: true,
  mayManageTeam: true,
  mayCreateStaffInvitation: true,
  mayDeactivateStaffMember: true,
  mayReactivateStaffMember: true,
  mayChangeStaffRole: true,
  mayAssignAdminRole: false,
  mayAssignSuperAdminRole: false,
} as const;

describe("StaffShell logout surfaces", () => {
  it("uses the dark variant in the desktop sidebar and the light variant in the mobile header", () => {
    const html = renderToStaticMarkup(<StaffShell principal={principal} capabilities={capabilities} labels={labels} locale="en"><p>Content</p></StaffShell>);
    expect(html.match(/data-logout-variant="dark"/gu)).toHaveLength(1);
    expect(html.match(/data-logout-variant="light"/gu)).toHaveLength(1);
    expect(html.indexOf('data-logout-variant="dark"')).toBeLessThan(html.indexOf('data-logout-variant="light"'));
  });

  it("renders persistent desktop and mobile language switching without displacing mobile logout", () => {
    const html = renderToStaticMarkup(<StaffShell principal={principal} capabilities={capabilities} labels={labels} locale="fa"><p>Content</p></StaffShell>);
    expect(html.match(/data-language-variant="dark"/gu)).toHaveLength(1);
    expect(html.match(/data-language-variant="light"/gu)).toHaveLength(1);
    expect(html.match(/data-language-locale="fa"/gu)).toHaveLength(2);

    const mobileActions = html.slice(html.indexOf("data-staff-mobile-actions"), html.indexOf("</header>"));
    expect(mobileActions).toContain('data-language-variant="light"');
    expect(mobileActions).toContain('data-logout-variant="light"');
  });
});
