import {getTranslations} from "next-intl/server";

import type {AssignableTeamMemberDto} from "@/features/inquiries/application/dto/team-operations-dto";
import {StaffPageHeader, StaffState} from "@/features/inquiries/presentation/components/staff/staff-ui";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

export async function StaffTeamMembers({locale, teamMembers}: Readonly<{locale: Locale; teamMembers: readonly AssignableTeamMemberDto[]}>) {
  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <>
      <StaffPageHeader eyebrow={t("common.operations")} title={t("team.title")} description={t("team.description")} />
      {teamMembers.length === 0 ? <StaffState title={t("states.emptyTeamTitle")} description={t("states.emptyTeamDescription")} /> : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {teamMembers.map((member) => (
            <li key={member.id} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-bold text-stone-950">{member.displayName}</h2><span className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800">{t("team.active")}</span></div>
              <p className="mt-4 text-xs text-stone-500">{t("common.teamMemberId")}</p>
              <p className="mt-1 break-all font-mono text-xs text-stone-800"><LtrIsolate>{member.id}</LtrIsolate></p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
