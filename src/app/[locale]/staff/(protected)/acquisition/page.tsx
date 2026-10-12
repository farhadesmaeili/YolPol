import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {getStaffDiscoveryCandidates} from "@/composition/customer-acquisition/staff-discovery";
import {resolveStaffPanelAccess} from "@/composition/staff-panel/staff-panel";
import {StaffDiscoveryList} from "@/features/customer-acquisition/presentation/components/staff-discovery-list";
import {isLocale} from "@/i18n/locale";

type StaffDiscoveryPageProps = Readonly<{
  params: Promise<{locale: string}>;
  searchParams: Promise<{cursor?: string | string[]}>;
}>;

export async function generateMetadata({params}: StaffDiscoveryPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  return {title: (await getTranslations({locale, namespace: "StaffDiscovery"}))("metadata")};
}

export default async function StaffDiscoveryPage({params, searchParams}: StaffDiscoveryPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const access = await resolveStaffPanelAccess();
  if (access.status !== "authorized") return null;
  if (!access.capabilities.mayViewDiscoveryCandidates) return <StaffDiscoveryList locale={locale} result={{status: "forbidden"}} />;

  const {cursor} = await searchParams;
  const safeCursor = typeof cursor === "string" && cursor.length <= 2048 ? cursor : null;
  const result = await getStaffDiscoveryCandidates().execute(access.principal, safeCursor);
  return <StaffDiscoveryList locale={locale} result={result} />;
}
