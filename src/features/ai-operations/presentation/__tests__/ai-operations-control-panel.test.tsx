import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

import {AiOperationsControlPanel, type AiOperationsControlPanelLabels} from "@/features/ai-operations/presentation/components/ai-operations-control-panel";
import {getLocaleDirection} from "@/i18n/locale";

const labels: AiOperationsControlPanelLabels = {
  eyebrow: "Runtime policy", title: "AI Operations Control Plane", description: "Operations permission only", configuredState: "Configured policy", effectiveState: "Effective eligibility", effectiveAllowed: "May become eligible", effectiveBlocked: "Not eligible", eligibilityNotice: "Future AI may become eligible only; this does not execute AI.", noPolicy: "No policy", emergencyOverride: "Emergency override",
  emergencyStates: {INACTIVE: "Inactive", ACTIVE: "Forced off", INVALID: "Invalid and forced off"},
  decisionReasons: {POLICY_DISABLED: "Disabled", OUTSIDE_SCHEDULE: "Outside schedule", EMERGENCY_DISABLED: "Emergency disabled", POLICY_UNAVAILABLE: "Unavailable", POLICY_INVALID: "Invalid", ALLOWED_FALLBACK: "Fallback allowed", ALLOWED_SCHEDULE: "Schedule allowed"},
  mode: "Mode", modes: {DISABLED: "Disabled", FALLBACK: "Fallback", SCHEDULED: "Scheduled"}, businessTimeZone: "Business time zone", gracePeriodMinutes: "Human grace minutes", schedule: "Schedule", scheduleDescription: "Business-local schedule", weekday: "Weekday",
  weekdays: {MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday", SUNDAY: "Sunday"},
  start: "Start", end: "End", enabled: "Enabled", addWindow: "Add window", removeWindow: "Remove", version: "Version", updatedAt: "Updated", updatedBy: "Updated by", notAvailable: "N/A", confirmEligibility: "Confirm eligibility change", save: "Save policy", disableImmediately: "Disable immediately", saving: "Saving", saved: "Saved",
  errors: {invalid: "Invalid", conflict: "Conflict", forbidden: "Forbidden", rate_limited: "Limited", failed: "Failed", confirmation: "Confirmation required"},
  readOnly: "Read-only policy", auditTitle: "Audit history", auditDescription: "Immutable history", auditEmpty: "No changes", eventTypes: {POLICY_CREATED: "Created", POLICY_UPDATED: "Updated"}, previousVersion: "Previous version", newVersion: "New version",
};

describe("AiOperationsControlPanel", () => {
  it("separates configured and effective state, exposes the emergency override, and keeps read-only roles non-mutating", () => {
    const html = renderToStaticMarkup(<AiOperationsControlPanel locale="fa" mayManage={false} labels={labels} events={[]} status={{policy: null, effectiveDecision: {allowed: false, reason: "POLICY_UNAVAILABLE"}, emergencyOverride: {active: true, state: "INVALID"}}} />);
    expect(html).toContain("Configured policy");
    expect(html).toContain("Effective eligibility");
    expect(html).toContain("Invalid and forced off");
    expect(html).toContain("Future AI may become eligible only");
    expect(html).toContain("Read-only policy");
    expect(html).not.toContain('type="submit"');
  });

  it("keeps the AI Operations message contract in parity across all supported locales", () => {
    const namespaces = ["en", "tr", "fa", "ar"].map((locale) => JSON.parse(readFileSync(`src/i18n/messages/${locale}.json`, "utf8")).AiOperations as Record<string, unknown>);
    const keys = (value: unknown, prefix = ""): string[] => typeof value === "object" && value !== null && !Array.isArray(value)
      ? Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => keys(child, prefix ? `${prefix}.${key}` : key))
      : [prefix];
    expect(namespaces.map((namespace) => keys(namespace).sort())).toEqual(Array(4).fill(keys(namespaces[0]).sort()));
    expect(["en", "tr", "fa", "ar"].map((locale) => getLocaleDirection(locale as "en" | "tr" | "fa" | "ar"))).toEqual(["ltr", "ltr", "rtl", "rtl"]);
  });

  it("renders all modes and the timezone, grace, schedule, and intent controls for managers", () => {
    const policy = {mode: "SCHEDULED" as const, businessTimeZone: "Asia/Tehran", humanGracePeriodSeconds: 900, scheduleWindows: [{weekday: "MONDAY" as const, startMinute: 540, endMinute: 600, enabled: true}], version: 4, updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "staff:member-1"};
    const html = renderToStaticMarkup(<AiOperationsControlPanel locale="en" mayManage labels={labels} events={[]} status={{policy, effectiveDecision: {allowed: true, reason: "ALLOWED_SCHEDULE"}, emergencyOverride: {active: false, state: "INACTIVE"}}} />);
    expect(html).toContain('<option value="DISABLED">');
    expect(html).toContain('<option value="FALLBACK">');
    expect(html).toContain('<option value="SCHEDULED" selected="">');
    expect(html).toContain('value="Asia/Tehran"');
    expect(html).toContain('type="number"');
    expect(html.match(/type="time"/gu)).toHaveLength(2);
    expect(html).toContain("Confirm eligibility change");
    expect(html).toContain('type="submit"');
  });
});
