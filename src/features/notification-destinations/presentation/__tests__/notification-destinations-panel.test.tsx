import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

import type {NotificationDestinationLabels} from "@/features/notification-destinations/presentation/components/notification-destinations-panel";
import {NotificationDestinationsPanel} from "@/features/notification-destinations/presentation/components/notification-destinations-panel";
import {getLocaleDirection} from "@/i18n/locale";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import type {Locale} from "@/shared/types/locale";

const messages = {en: enMessages.Staff, tr: trMessages.Staff, fa: faMessages.Staff, ar: arMessages.Staff} as const;
function labels(locale: Locale): NotificationDestinationLabels {
  const value = messages[locale]; const n = value.notificationDestinations;
  return {title: n.title, description: n.description, teamMembers: n.teamMembers, groups: n.groups, audit: n.audit, auditEmpty: n.auditEmpty, linked: n.linked, authorized: n.authorized, disconnected: n.disconnected, enabled: n.enabled, disabled: n.disabled, status: value.common.status, enable: n.enable, disable: n.disable, disconnect: n.disconnect, createGroup: n.createGroup, openTelegram: n.openTelegram, revokeRequest: n.revokeRequest, pendingGroup: n.pendingGroup, expiresAt: value.teamManagement.expiresAt, working: value.teamManagement.working, error: n.error, telegramRequired: n.telegramRequired, emptyGroups: n.emptyGroups, eventTypes: n.events};
}
const initial = {teamMembers: [{staffAccountId: "account-1", displayName: "Operations", role: "ADMIN" as const, telegramLinked: true, authorized: false, notificationsEnabled: false, mayManage: true}], groups: [{recipientId: "recipient-1", displayName: "Sales Group", authorized: true, notificationsEnabled: true}], auditEvents: [], mayCreateGroupRequest: true};

describe("notification destinations Staff UI", () => {
  it.each(["en", "tr", "fa", "ar"] as const)("renders localized responsive management in %s and correct page direction", (locale) => {
    const html = renderToStaticMarkup(<div lang={locale} dir={getLocaleDirection(locale)}><NotificationDestinationsPanel locale={locale} labels={labels(locale)} initial={initial} /></div>);
    expect(html).toContain(`lang="${locale}" dir="${getLocaleDirection(locale)}"`);
    expect(html).toContain(messages[locale].notificationDestinations.title);
    expect(html).toContain("md:grid-cols-2");
  });

  it("never renders raw Telegram IDs, credentials, or commercial data", () => {
    const html = renderToStaticMarkup(<NotificationDestinationsPanel locale="en" labels={labels("en")} initial={initial} />);
    expect(html).not.toMatch(/externalId|chatId|telegramUserId|connectionToken|tokenLookup|tokenVerification|internalUnitPrice|pricePerBottle/iu);
    expect(html).not.toContain("https://t.me/");
  });
});
