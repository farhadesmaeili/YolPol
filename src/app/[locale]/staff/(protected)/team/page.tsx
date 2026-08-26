import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffPanelTeamOperations, resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffTeamMembers} from "@/features/inquiries/presentation/components/staff/staff-team-members";
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
  const result = await getStaffPanelTeamOperations().listAssignableTeamMembers.execute();
  if (result.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  return <StaffTeamMembers locale={locale} teamMembers={result.teamMembers} />;
}
