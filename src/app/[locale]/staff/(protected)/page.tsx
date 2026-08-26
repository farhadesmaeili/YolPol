import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffPanelTeamOperations, resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffDashboard} from "@/features/inquiries/presentation/components/staff/staff-dashboard";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type StaffDashboardPageProps = Readonly<{params: Promise<{locale: string}>}>;

export async function generateMetadata({params}: StaffDashboardPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.dashboard")};
}

export default async function StaffDashboardPage({params}: StaffDashboardPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const result = await getStaffPanelTeamOperations().listInquiries.execute({pageSize: 5});
  if (result.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  return <StaffDashboard locale={locale} principal={access.principal} recent={result.inquiries} />;
}
