import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({resolveAccess: vi.fn(), execute: vi.fn()}));
vi.mock("@/composition/staff-panel/staff-panel", () => ({resolveStaffPanelAccess: mocks.resolveAccess}));
vi.mock("@/composition/customer-acquisition/staff-discovery", () => ({getStaffDiscoveryCandidates: () => ({execute: mocks.execute})}));
vi.mock("@/features/customer-acquisition/presentation/components/staff-discovery-list", () => ({StaffDiscoveryList: ({result}: {result: {status: string}}) => <div>{result.status}</div>}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => { throw new Error("not found"); }}));

import StaffDiscoveryPage from "@/app/[locale]/staff/(protected)/acquisition/page";

const props = {params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({cursor: "synthetic-cursor"})};

describe("Staff discovery direct route", () => {
  beforeEach(() => { mocks.resolveAccess.mockReset(); mocks.execute.mockReset(); });

  it("does not read candidates for an unauthenticated request", async () => {
    mocks.resolveAccess.mockResolvedValue({status: "unauthorized"});
    expect(await StaffDiscoveryPage(props)).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("denies an authenticated Viewer before constructing the reader", async () => {
    mocks.resolveAccess.mockResolvedValue({status: "authorized", principal: {role: "VIEWER"}, capabilities: {mayViewDiscoveryCandidates: false}});
    expect(renderToStaticMarkup(await StaffDiscoveryPage(props))).toContain("forbidden");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("passes a bounded cursor and authenticated principal to the application boundary", async () => {
    const principal = {role: "ADMIN"};
    mocks.resolveAccess.mockResolvedValue({status: "authorized", principal, capabilities: {mayViewDiscoveryCandidates: true}});
    mocks.execute.mockResolvedValue({status: "unavailable", reason: "unconfigured"});
    expect(renderToStaticMarkup(await StaffDiscoveryPage(props))).toContain("unavailable");
    expect(mocks.execute).toHaveBeenCalledWith(principal, "synthetic-cursor");
    await StaffDiscoveryPage({...props, searchParams: Promise.resolve({cursor: "x".repeat(2049)})});
    expect(mocks.execute).toHaveBeenLastCalledWith(principal, null);
  });
});
