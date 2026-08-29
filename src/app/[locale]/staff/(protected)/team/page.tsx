import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {getStaffAuthentication} from "@/composition/staff-authentication/staff-authentication";
import {getStaffManagement} from "@/composition/staff-authentication/staff-management";
import {StaffTeamManagement} from "@/features/staff-authentication/presentation/components/staff-team-management";
import {presentStaffTeamManagement} from "@/features/staff-authentication/presentation/presenters/staff-team-management-presenter";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type StaffTeamPageProps = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: StaffTeamPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.team")};
}

export default async function StaffTeamPage({params}: StaffTeamPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const result = await getStaffManagement().listTeam.execute(access.principal);
  if (result.status === "forbidden") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.forbiddenTitle")} description={t("states.forbiddenDescription")} />;
  }
  if (result.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  const t = await getTranslations({locale, namespace: "Staff"});
  const team = presentStaffTeamManagement(result.team, access.principal, getStaffAuthentication().authorization);
  return <StaffTeamManagement locale={locale} team={team} labels={{
    title: t("teamManagement.title"), description: t("teamManagement.description"), createInvitation: t("teamManagement.createInvitation"),
    displayName: t("common.displayName"), email: t("common.email"), role: t("common.role"), status: t("common.status"), createdAt: t("common.created"), expiresAt: t("teamManagement.expiresAt"),
    telegram: t("common.telegram"), linked: t("teamManagement.linked"), notLinked: t("teamManagement.notLinked"), active: t("teamManagement.active"), inactive: t("teamManagement.inactive"),
    invitations: t("teamManagement.invitations"), accounts: t("teamManagement.accounts"), actions: t("teamManagement.actions"), activationCode: t("teamManagement.activationCode"), activationCodeNotice: t("teamManagement.activationCodeNotice"), invitationCreated: t("teamManagement.invitationCreated"),
    submitInvitation: t("teamManagement.submitInvitation"), changeRole: t("teamManagement.changeRole"), deactivate: t("teamManagement.deactivate"), reactivate: t("teamManagement.reactivate"), revoke: t("teamManagement.revoke"), working: t("teamManagement.working"), error: t("teamManagement.error"), emptyInvitations: t("teamManagement.emptyInvitations"),
    roles: {SUPER_ADMIN: t("roles.SUPER_ADMIN"), ADMIN: t("roles.ADMIN"), SALES: t("roles.SALES"), VIEWER: t("roles.VIEWER")},
    invitationStatuses: {ACTIVE: t("teamManagement.invitationStatuses.ACTIVE"), EXPIRED: t("teamManagement.invitationStatuses.EXPIRED"), CONSUMED: t("teamManagement.invitationStatuses.CONSUMED"), REVOKED: t("teamManagement.invitationStatuses.REVOKED")},
  }} />;
}
