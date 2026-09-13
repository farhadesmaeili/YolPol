import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it, vi} from "vitest";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import {resolveStaffPanelPrincipal} from "@/features/staff-authentication/presentation/adapters/staff-panel-access";
import {submitStaffLogin, submitStaffLogout} from "@/features/staff-authentication/presentation/clients/staff-auth-client";

const principal: StaffPrincipal = Object.freeze({
  staffAccountId: "account-1",
  teamMemberId: "member-1",
  role: "ADMIN",
  displayName: "Operations Admin",
  actorReference: "staff:member-1",
});

const capabilities = Object.freeze({
  mayAccessStaffPanel: true,
  mayViewInquiries: true,
  mayViewCustomerConversation: true,
  mayReplyToCustomerConversation: true,
  mayPublishStaffTyping: true,
  mayUpdateInquiryWorkflow: true,
  mayManageTeam: true,
  mayCreateStaffInvitation: true,
  mayDeactivateStaffMember: true,
  mayReactivateStaffMember: true,
  mayChangeStaffRole: true,
  mayAssignAdminRole: false,
  mayAssignSuperAdminRole: false,
});

function authentication(result: Readonly<Record<string, unknown>>, authorized = true) {
  return {
    resolveSession: {execute: vi.fn().mockResolvedValue(result)},
    authorization: {
      mayAccessStaffPanel: vi.fn().mockReturnValue(authorized),
      capabilitiesFor: vi.fn().mockReturnValue(capabilities),
    },
  };
}

describe("Staff panel authentication boundary", () => {
  it("rejects a missing credential without resolving a session", async () => {
    const access = authentication({status: "authenticated", principal});
    await expect(resolveStaffPanelPrincipal(null, access)).resolves.toEqual({status: "unauthorized"});
    expect(access.resolveSession.execute).not.toHaveBeenCalled();
  });

  it("authorizes only a server-resolved principal permitted by the existing policy", async () => {
    const access = authentication({status: "authenticated", principal});
    await expect(resolveStaffPanelPrincipal("opaque-cookie-value", access)).resolves.toEqual({status: "authorized", principal, capabilities});
    expect(access.resolveSession.execute).toHaveBeenCalledWith({sessionCredential: "opaque-cookie-value"});
    expect(access.authorization.mayAccessStaffPanel).toHaveBeenCalledWith(principal);
    expect(access.authorization.capabilitiesFor).toHaveBeenCalledWith(principal);
  });

  it("separates unauthenticated, forbidden, and dependency failure states", async () => {
    await expect(resolveStaffPanelPrincipal("credential", authentication({status: "unauthorized"}))).resolves.toEqual({status: "unauthorized"});
    await expect(resolveStaffPanelPrincipal("credential", authentication({status: "authenticated", principal}, false))).resolves.toEqual({status: "forbidden"});
    await expect(resolveStaffPanelPrincipal("credential", authentication({status: "persistence_failed"}))).resolves.toEqual({status: "service_unavailable"});
  });
});

describe("Staff authentication browser clients", () => {
  it("submits login to the existing API and returns only a generic outcome", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({status: "authenticated"}), {status: 200}));
    await expect(submitStaffLogin(fetcher, {email: "staff@example.test", password: "not-a-real-password"})).resolves.toBe("authenticated");
    expect(fetcher).toHaveBeenCalledWith("/api/staff/auth/login", expect.objectContaining({method: "POST", body: JSON.stringify({email: "staff@example.test", password: "not-a-real-password"})}));
  });

  it("preserves the existing generic login failure outcome", async () => {
    const rejected = vi.fn().mockResolvedValue(new Response(JSON.stringify({code: "authentication_failed"}), {status: 401}));
    const unavailable = vi.fn().mockRejectedValue(new Error("network unavailable"));
    await expect(submitStaffLogin(rejected, {email: "staff@example.test", password: "wrong-password"})).resolves.toBe("failed");
    await expect(submitStaffLogin(unavailable, {email: "staff@example.test", password: "temporary-password"})).resolves.toBe("failed");
  });

  it("uses the existing logout API and does not manipulate the HttpOnly cookie", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {status: 200}));
    await expect(submitStaffLogout(fetcher)).resolves.toBe("logged_out");
    expect(fetcher).toHaveBeenCalledWith("/api/staff/auth/logout", {method: "POST"});
  });

  it("contains no browser credential storage and navigates only to fixed Staff routes", () => {
    const componentDirectory = join(process.cwd(), "src", "features", "staff-authentication", "presentation", "components");
    const source = ["staff-login-form.tsx", "staff-logout-button.tsx"]
      .map((file) => readFileSync(join(componentDirectory, file), "utf8"))
      .join("\n");
    expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/u);
    expect(source).toContain('router.replace("/staff")');
    expect(source).toContain('router.replace("/staff/login")');
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("keeps page guarding server-side with localized fixed redirects and private metadata", () => {
    const staffRoutes = join(process.cwd(), "src", "app", "[locale]", "staff");
    const protectedLayout = readFileSync(join(staffRoutes, "(protected)", "layout.tsx"), "utf8");
    const loginPage = readFileSync(join(staffRoutes, "login", "page.tsx"), "utf8");
    const rootLayout = readFileSync(join(staffRoutes, "layout.tsx"), "utf8");
    expect(protectedLayout).toContain('access.status === "unauthorized"');
    expect(protectedLayout).toContain('redirect({href: "/staff/login", locale})');
    expect(loginPage).toContain('redirect({href: "/staff", locale})');
    expect(rootLayout).toContain('robots: {index: false, follow: false, nocache: true}');
    expect(rootLayout).toContain('dynamic = "force-dynamic"');
  });
});
