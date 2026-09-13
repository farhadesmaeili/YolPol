import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffPanelTeamOperations, resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffInquiryList} from "@/features/inquiries/presentation/components/staff/staff-inquiry-list";
import {StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {parseStaffInquiryFilters, type StaffInquiryFilterState} from "@/features/inquiries/presentation/parsers/staff-inquiry-filters";
import {isLocale} from "@/i18n/locale";

type StaffInquiriesPageProps = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({params}: StaffInquiriesPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "Staff"}))("metadata.inquiries")};
}

export default async function StaffInquiriesPage({params, searchParams}: StaffInquiriesPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;

  const operations = getStaffPanelTeamOperations();
  const membersResult = await operations.listAssignableTeamMembers.execute();
  if (membersResult.status !== "found") return <ServiceUnavailable locale={locale} />;

  let filters = parseStaffInquiryFilters(await searchParams, new Set(membersResult.teamMembers.map(({id}) => id)));
  let inquiriesResult = await operations.listInquiries.execute(filters.input);
  if (inquiriesResult.status === "validation_failed") {
    filters = withoutCursor(filters);
    inquiriesResult = await operations.listInquiries.execute(filters.input);
  }
  if (inquiriesResult.status !== "found") return <ServiceUnavailable locale={locale} />;

  return <StaffInquiryList locale={locale} filters={filters} inquiries={inquiriesResult.inquiries} nextCursor={inquiriesResult.nextCursor} teamMembers={membersResult.teamMembers} />;
}

function withoutCursor(filters: StaffInquiryFilterState): StaffInquiryFilterState {
  const input = Object.freeze({
    ...(filters.input.status ? {status: filters.input.status} : {}),
    ...(filters.input.assignment ? {assignment: filters.input.assignment} : {}),
  });
  return Object.freeze({...filters, cursor: undefined, invalid: true, input});
}

async function ServiceUnavailable({locale}: Readonly<{locale: "en" | "tr" | "fa" | "ar"}>) {
  const t = await getTranslations({locale, namespace: "Staff"});
  return <StaffState title={t("states.serviceUnavailableTitle")} description={t("states.serviceUnavailableDescription")} />;
}
