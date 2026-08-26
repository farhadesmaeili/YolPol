import {getTranslations} from "next-intl/server";

import type {StaffPrincipal} from "@/features/staff-authentication/application/dto/staff-principal";
import type {TeamInquiryListItemDto} from "@/features/inquiries/application/dto/team-operations-dto";
import {Link} from "@/i18n/navigation";
import {LtrIsolate, formatHumanNumber} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";
import {StaffDateTime, StaffPageHeader, StaffPanel, StaffState, StaffStatusBadge} from "@/features/inquiries/presentation/components/staff/staff-ui";

export async function StaffDashboard({locale, principal, recent}: Readonly<{
  locale: Locale;
  principal: StaffPrincipal;
  recent: readonly TeamInquiryListItemDto[];
}>) {
  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <>
      <StaffPageHeader
        eyebrow={t("common.operations")}
        title={t("dashboard.title")}
        description={t("dashboard.description", {name: principal.displayName})}
        action={<Link href="/staff/inquiries" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("dashboard.openQueue")}</Link>}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <StaffPanel title={t("dashboard.recentInquiries")}>
          {recent.length === 0 ? (
            <StaffState title={t("states.emptyInquiriesTitle")} description={t("states.emptyInquiriesDescription")} />
          ) : (
            <ul className="divide-y divide-stone-200">
              {recent.map((inquiry) => (
                <li key={inquiry.id}>
                  <Link href={`/staff/inquiries/${encodeURIComponent(inquiry.id)}`} className="flex min-h-16 flex-col gap-2 py-4 outline-none hover:text-emerald-900 focus-visible:ring-2 focus-visible:ring-emerald-700 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{inquiry.customerDisplayName}</span>
                      <span className="mt-1 block text-xs text-stone-500"><LtrIsolate>{inquiry.id}</LtrIsolate> · <StaffDateTime locale={locale} value={inquiry.createdAt} /></span>
                    </span>
                    <StaffStatusBadge status={inquiry.status} label={t(`statuses.${inquiry.status}`)} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </StaffPanel>
        <StaffPanel title={t("dashboard.sessionTitle")}>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-stone-500">{t("common.displayName")}</dt><dd className="mt-1 break-words font-semibold">{principal.displayName}</dd></div>
            <div><dt className="text-stone-500">{t("common.role")}</dt><dd className="mt-1 font-semibold">{t(`roles.${principal.role}`)}</dd></div>
            <div><dt className="text-stone-500">{t("common.teamMemberId")}</dt><dd className="mt-1 break-all font-mono text-xs"><LtrIsolate>{principal.teamMemberId}</LtrIsolate></dd></div>
            <div><dt className="text-stone-500">{t("dashboard.previewCount")}</dt><dd className="mt-1 font-semibold">{formatHumanNumber(locale, recent.length)}</dd></div>
          </dl>
        </StaffPanel>
      </div>
    </>
  );
}
