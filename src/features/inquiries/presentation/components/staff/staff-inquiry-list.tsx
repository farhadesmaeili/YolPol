import {getTranslations} from "next-intl/server";

import type {AssignableTeamMemberDto, TeamInquiryListItemDto} from "@/features/inquiries/application/dto/team-operations-dto";
import type {StaffInquiryFilterState} from "@/features/inquiries/presentation/parsers/staff-inquiry-filters";
import {serializeStaffInquiryFilters, unassignedFilterValue} from "@/features/inquiries/presentation/parsers/staff-inquiry-filters";
import {StaffDateTime, StaffPageHeader, StaffState, StaffStatusBadge} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {inquiryStatuses} from "@/features/inquiries/domain/types/inquiry-types";
import {Link} from "@/i18n/navigation";
import {formatHumanNumber, LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

function location(country: string | null, city: string | null): string {
  return [city, country].filter(Boolean).join(", ") || "—";
}

export async function StaffInquiryList({filters, inquiries, locale, nextCursor, teamMembers}: Readonly<{
  filters: StaffInquiryFilterState;
  inquiries: readonly TeamInquiryListItemDto[];
  locale: Locale;
  nextCursor: string | null;
  teamMembers: readonly AssignableTeamMemberDto[];
}>) {
  const t = await getTranslations({locale, namespace: "Staff"});
  const routeArrow = locale === "fa" || locale === "ar" ? "←" : "→";
  return (
    <>
      <StaffPageHeader eyebrow={t("common.operations")} title={t("inquiries.title")} description={t("inquiries.description")} />
      <form method="get" className="mb-5 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
        <div>
          <label htmlFor="staff-status-filter" className="mb-2 block text-sm font-semibold text-stone-800">{t("filters.status")}</label>
          <select id="staff-status-filter" name="status" defaultValue={filters.status} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20">
            <option value="">{t("filters.allStatuses")}</option>
            {inquiryStatuses.map((status) => <option key={status} value={status}>{t(`statuses.${status}`)}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="staff-assignment-filter" className="mb-2 block text-sm font-semibold text-stone-800">{t("filters.assignment")}</label>
          <select id="staff-assignment-filter" name="assignment" defaultValue={filters.assignment} className="min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm outline-none focus:border-emerald-800 focus:ring-2 focus:ring-emerald-800/20">
            <option value="">{t("filters.allAssignments")}</option>
            <option value={unassignedFilterValue}>{t("common.unassigned")}</option>
            {teamMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
          </select>
        </div>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("filters.apply")}</button>
        <Link href="/staff/inquiries" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 outline-none hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("filters.clear")}</Link>
      </form>

      {filters.invalid ? <p role="status" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t("states.invalidFilters")}</p> : null}

      {inquiries.length === 0 ? (
        <StaffState title={t("states.emptyInquiriesTitle")} description={t("states.emptyFilteredInquiriesDescription")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[920px] border-collapse text-start text-sm">
              <caption className="sr-only">{t("inquiries.tableCaption")}</caption>
              <thead className="bg-stone-50 text-xs font-semibold text-stone-600">
                <tr><th scope="col" className="px-4 py-3 text-start">{t("common.customer")}</th><th scope="col" className="px-4 py-3 text-start">{t("common.route")}</th><th scope="col" className="px-4 py-3 text-start">{t("common.status")}</th><th scope="col" className="px-4 py-3 text-start">{t("common.assignment")}</th><th scope="col" className="px-4 py-3 text-start">{t("common.activity")}</th><th scope="col" className="px-4 py-3 text-start">{t("common.created")}</th><th scope="col" className="px-4 py-3 text-start"><span className="sr-only">{t("common.open")}</span></th></tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {inquiries.map((inquiry) => (
                  <tr key={inquiry.id} className="align-top">
                    <td className="px-4 py-4"><p className="max-w-56 break-words font-semibold">{inquiry.customerDisplayName}</p><p className="mt-1 max-w-56 break-words text-xs text-stone-500">{inquiry.company ?? t("common.notProvided")}</p><p className="mt-1 font-mono text-[11px] text-stone-400"><LtrIsolate>{inquiry.id}</LtrIsolate></p></td>
                    <td className="px-4 py-4 text-stone-700"><p>{location(inquiry.origin.country, inquiry.origin.city)}</p><p className="mt-1 text-xs text-stone-500">{routeArrow} {location(inquiry.destination.country, inquiry.destination.city)}</p></td>
                    <td className="px-4 py-4"><StaffStatusBadge status={inquiry.status} label={t(`statuses.${inquiry.status}`)} /></td>
                    <td className="px-4 py-4 text-stone-700">{inquiry.assignment?.displayName ?? t("common.unassigned")}</td>
                    <td className="px-4 py-4 text-stone-700"><p>{formatHumanNumber(locale, inquiry.items.length)} {t("common.items")}</p><p className="mt-1 text-xs text-stone-500">{formatHumanNumber(locale, inquiry.conversationActivity.messageCount)} {t("common.messages")}</p></td>
                    <td className="px-4 py-4 text-stone-700"><StaffDateTime locale={locale} value={inquiry.createdAt} /></td>
                    <td className="px-4 py-4"><Link href={`/staff/inquiries/${encodeURIComponent(inquiry.id)}`} className="inline-flex min-h-10 items-center rounded-lg px-3 font-semibold text-emerald-800 outline-none hover:bg-emerald-50 focus-visible:ring-2 focus-visible:ring-emerald-700">{t("common.open")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="divide-y divide-stone-200 md:hidden">
            {inquiries.map((inquiry) => (
              <li key={inquiry.id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{inquiry.customerDisplayName}</h2><p className="mt-1 break-words text-xs text-stone-500">{inquiry.company ?? t("common.notProvided")}</p></div><StaffStatusBadge status={inquiry.status} label={t(`statuses.${inquiry.status}`)} /></div>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-stone-500">{t("common.route")}</dt><dd className="mt-1 break-words">{location(inquiry.origin.country, inquiry.origin.city)} {routeArrow} {location(inquiry.destination.country, inquiry.destination.city)}</dd></div><div><dt className="text-xs text-stone-500">{t("common.assignment")}</dt><dd className="mt-1 break-words">{inquiry.assignment?.displayName ?? t("common.unassigned")}</dd></div><div><dt className="text-xs text-stone-500">{t("common.created")}</dt><dd className="mt-1"><StaffDateTime locale={locale} value={inquiry.createdAt} /></dd></div><div><dt className="text-xs text-stone-500">{t("common.activity")}</dt><dd className="mt-1">{formatHumanNumber(locale, inquiry.items.length)} {t("common.items")} · {formatHumanNumber(locale, inquiry.conversationActivity.messageCount)} {t("common.messages")}</dd></div></dl>
                <Link href={`/staff/inquiries/${encodeURIComponent(inquiry.id)}`} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-stone-300 font-semibold text-emerald-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">{t("common.open")}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <nav aria-label={t("pagination.label")} className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-stone-500">{filters.cursor ? t("pagination.browserBack") : t("pagination.firstPage")}</p>
        {nextCursor ? <Link href={serializeStaffInquiryFilters(filters, nextCursor)} rel="next" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-stone-950 px-5 text-sm font-semibold text-white outline-none hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("pagination.next")}</Link> : <span className="text-sm font-semibold text-stone-500">{t("pagination.end")}</span>}
      </nav>
    </>
  );
}
