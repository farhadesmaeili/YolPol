import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getNotificationDestinationOperations} from "@/composition/notification-destinations/notification-destinations";
import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {NotificationDestinationsPanel} from "@/features/notification-destinations/presentation/components/notification-destinations-panel";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type Props = Readonly<{params: Promise<{locale: string}>}>;
export async function generateMetadata({params}: Props): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.notificationDestinations")};
}

export default async function NotificationDestinationsPage({params}: Props) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const result = await getNotificationDestinationOperations().list.execute(access.principal);
  const t = await getTranslations({locale, namespace: "Staff"});
  if (result.status === "forbidden") return <StaffState title={t("states.forbiddenTitle")} description={t("states.forbiddenDescription")} />;
  if (result.status !== "found") return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  return <NotificationDestinationsPanel locale={locale} initial={result.value} labels={{
    title: t("notificationDestinations.title"), description: t("notificationDestinations.description"), teamMembers: t("notificationDestinations.teamMembers"), groups: t("notificationDestinations.groups"), audit: t("notificationDestinations.audit"), auditEmpty: t("notificationDestinations.auditEmpty"),
    linked: t("notificationDestinations.linked"), authorized: t("notificationDestinations.authorized"), disconnected: t("notificationDestinations.disconnected"), enabled: t("notificationDestinations.enabled"), disabled: t("notificationDestinations.disabled"), status: t("common.status"), enable: t("notificationDestinations.enable"), disable: t("notificationDestinations.disable"), disconnect: t("notificationDestinations.disconnect"), createGroup: t("notificationDestinations.createGroup"), openTelegram: t("notificationDestinations.openTelegram"), revokeRequest: t("notificationDestinations.revokeRequest"), pendingGroup: t("notificationDestinations.pendingGroup"), expiresAt: t("teamManagement.expiresAt"), working: t("teamManagement.working"), error: t("notificationDestinations.error"), telegramRequired: t("notificationDestinations.telegramRequired"), emptyGroups: t("notificationDestinations.emptyGroups"),
    eventTypes: {TEAM_MEMBER_ENABLED: t("notificationDestinations.events.TEAM_MEMBER_ENABLED"), TEAM_MEMBER_DISABLED: t("notificationDestinations.events.TEAM_MEMBER_DISABLED"), TEAM_MEMBER_LINK_DISCONNECTED: t("notificationDestinations.events.TEAM_MEMBER_LINK_DISCONNECTED"), TEAM_GROUP_AUTHORIZED: t("notificationDestinations.events.TEAM_GROUP_AUTHORIZED"), TEAM_GROUP_ENABLED: t("notificationDestinations.events.TEAM_GROUP_ENABLED"), TEAM_GROUP_DISABLED: t("notificationDestinations.events.TEAM_GROUP_DISABLED"), TEAM_GROUP_DISCONNECTED: t("notificationDestinations.events.TEAM_GROUP_DISCONNECTED")},
  }} />;
}
