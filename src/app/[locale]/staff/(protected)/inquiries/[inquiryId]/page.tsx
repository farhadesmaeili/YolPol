import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffPanelTeamOperations, resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffInquiryDetail} from "@/features/inquiries/presentation/components/staff/staff-inquiry-detail";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {isLocale} from "@/i18n/locale";

type StaffInquiryDetailPageProps = Readonly<{params: Promise<{locale: string; inquiryId: string}>}>;

export async function generateMetadata({params}: StaffInquiryDetailPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.inquiryDetail")};
}

export default async function StaffInquiryDetailPage({params}: StaffInquiryDetailPageProps) {
  const {locale, inquiryId} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  const result = await getStaffPanelTeamOperations().getInquiryDetail.execute({inquiryId});
  if (result.status === "inquiry_not_found" || result.status === "validation_failed") notFound();
  if (result.status !== "found") {
    const t = await getTranslations({locale, namespace: "Staff"});
    return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
  }
  return <StaffInquiryDetail detail={result.detail} locale={locale} />;
}
