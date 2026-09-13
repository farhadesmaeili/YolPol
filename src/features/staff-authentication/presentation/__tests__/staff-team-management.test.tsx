import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {StaffTeamManagement, type StaffTeamManagementLabels} from "@/features/staff-authentication/presentation/components/staff-team-management";
import type {StaffTeamManagementViewModel} from "@/features/staff-authentication/presentation/view-models/staff-team-management-view-model";
import arMessages from "@/i18n/messages/ar.json";
import enMessages from "@/i18n/messages/en.json";
import faMessages from "@/i18n/messages/fa.json";
import trMessages from "@/i18n/messages/tr.json";
import type {Locale} from "@/shared/types/locale";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({refresh: vi.fn()}),
}));

const team: StaffTeamManagementViewModel = Object.freeze({
  allowedInvitationRoles: Object.freeze([]),
  accounts: Object.freeze([Object.freeze({
    id: "internal-account-id",
    displayName: "Visible Staff Name",
    email: "staff@example.test",
    role: "SALES",
    active: true,
    createdAt: "2026-08-29T00:00:00.000Z",
    telegramLinked: false,
    actions: Object.freeze({allowedRoles: Object.freeze(["VIEWER"] as const), mayDeactivate: false, mayReactivate: false, mayForceDisconnectTelegram: false, mayRevokeTelegramRequest: false}),
  })]),
  invitations: Object.freeze([]),
});

const localizedMessages = {
  en: enMessages.Staff,
  tr: trMessages.Staff,
  fa: faMessages.Staff,
  ar: arMessages.Staff,
} as const;

function labels(locale: Locale): StaffTeamManagementLabels {
  const staff = localizedMessages[locale];
  return {
    title: staff.teamManagement.title,
    description: staff.teamManagement.description,
    createInvitation: staff.teamManagement.createInvitation,
    displayName: staff.common.displayName,
    email: staff.common.email,
    role: staff.common.role,
    status: staff.common.status,
    createdAt: staff.common.created,
    expiresAt: staff.teamManagement.expiresAt,
    telegram: staff.common.telegram,
    linked: staff.teamManagement.linked,
    notLinked: staff.teamManagement.notLinked,
    active: staff.teamManagement.active,
    inactive: staff.teamManagement.inactive,
    invitations: staff.teamManagement.invitations,
    accounts: staff.teamManagement.accounts,
    actions: staff.teamManagement.actions,
    activationCode: staff.teamManagement.activationCode,
    activationCodeNotice: staff.teamManagement.activationCodeNotice,
    invitationCreated: staff.teamManagement.invitationCreated,
    submitInvitation: staff.teamManagement.submitInvitation,
    changeRole: staff.teamManagement.changeRole,
    deactivate: staff.teamManagement.deactivate,
    reactivate: staff.teamManagement.reactivate,
    forceDisconnectTelegram: staff.teamManagement.forceDisconnectTelegram,
    revokeTelegramRequest: staff.teamManagement.revokeTelegramRequest,
    revoke: staff.teamManagement.revoke,
    working: staff.teamManagement.working,
    error: staff.teamManagement.error,
    emptyInvitations: staff.teamManagement.emptyInvitations,
    invitationStatuses: staff.teamManagement.invitationStatuses,
    roles: staff.roles,
  };
}

describe("Staff Team Management accessibility", () => {
  it.each(["en", "tr", "fa", "ar"] as const)("gives the %s role selector a localized member-specific accessible name", (locale) => {
    const html = renderToStaticMarkup(<StaffTeamManagement locale={locale} labels={labels(locale)} team={team} />);
    const label = html.match(/<label for="([^"]+)" class="sr-only">([^<]+)<\/label>/u);
    expect(label?.[2]).toBe(`${localizedMessages[locale].common.role}: Visible Staff Name`);
    expect(html).toContain(`<select id="${label?.[1]}" name="role"`);
    expect(label?.[2]).not.toContain("internal-account-id");
  });

  it("renders localized Telegram manager actions without exposing target IDs", () => {
    const managed = {...team, accounts: [{...team.accounts[0]!, telegramLinked: true, actions: {...team.accounts[0]!.actions, mayForceDisconnectTelegram: true, mayRevokeTelegramRequest: true}}]};
    const html = renderToStaticMarkup(<StaffTeamManagement locale="en" labels={labels("en")} team={managed} />);
    expect(html).toContain(enMessages.Staff.teamManagement.forceDisconnectTelegram);
    expect(html).toContain(enMessages.Staff.teamManagement.revokeTelegramRequest);
    expect(html).not.toContain("internal-account-id");
  });
});
