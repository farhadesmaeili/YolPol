import {getTranslations} from "next-intl/server";
import type {ReactNode} from "react";

import type {ListStaffDiscoveryResult} from "@/features/customer-acquisition/application/use-cases/list-staff-discovery-candidates";
import {Link} from "@/i18n/navigation";
import {LtrIsolate} from "@/shared/presentation/bidi/bidi-isolate";
import type {Locale} from "@/shared/types/locale";

export async function StaffDiscoveryList({locale, result}: Readonly<{locale: Locale; result: ListStaffDiscoveryResult}>) {
  const t = await getTranslations({locale, namespace: "StaffDiscovery"});
  const formatDate = (value: string) => new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}).format(new Date(value));
  const formatNumber = (value: number) => new Intl.NumberFormat(locale).format(value);

  return (
    <section aria-labelledby="discovery-title" className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-emerald-800">{t("eyebrow")}</p>
        <h1 id="discovery-title" className="text-3xl font-bold text-stone-950">{t("title")}</h1>
        <p className="max-w-3xl text-sm leading-6 text-stone-600">{t("description")}</p>
      </header>
      {result.status === "forbidden" ? <State title={t("forbiddenTitle")} description={t("forbiddenDescription")} />
        : result.status === "unavailable" ? <State title={result.reason === "unconfigured" ? t("unconfiguredTitle") : t("errorTitle")} description={result.reason === "unconfigured" ? t("unconfiguredDescription") : t("errorDescription")} />
          : result.page.candidates.length === 0 ? <State title={t("emptyTitle")} description={t("emptyDescription")} />
            : <>
              <p className="text-sm text-stone-600">{t("observationalNotice")}</p>
              <ul className="grid gap-4" aria-label={t("listLabel")}>
                {result.page.candidates.map((candidate) => <li key={candidate.id} className="min-w-0 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="min-w-0 break-words text-lg font-semibold">{candidate.name}</h2>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-900">{t(`eligibility.${candidate.eligibility.status}`)}</span>
                  </div>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                    <Field label={t("country")} value={candidate.country} />
                    <Field label={t("domain")} value={<LtrIsolate>{candidate.domain}</LtrIsolate>} />
                    <Field label={t("segment")} value={candidate.segment} />
                    <Field label={t("historicalState")} value={t(`states.${candidate.state}`)} />
                    <Field label={t("evaluatedAt")} value={formatDate(candidate.eligibility.evaluatedAt)} />
                    <Field label={t("expiresAt")} value={formatDate(candidate.expiresAt)} />
                    <Field label={t("expiration")} value={t(candidate.expired ? "expired" : "notExpired")} />
                    <Field label={t("suppression")} value={t(candidate.suppressed ? "suppressed" : "notSuppressed")} />
                    <Field label={t("policy")} value={t(candidate.policyAllowed ? "policyAllowed" : "policyDenied")} />
                  </dl>
                  <div className="mt-4 grid gap-3 border-t border-stone-100 pt-4 text-sm sm:grid-cols-2">
                    <div><h3 className="font-semibold">{t("evidence")}</h3><p>{t("evidenceCount", {count: formatNumber(candidate.evidence.length)})}</p>
                      <ul className="mt-1 list-inside list-disc">{candidate.evidence.map((item) => <li key={item.id}>{t(evidenceKindKey(item.kind))} · {t(evidenceFindingKey(item.kind, item.finding))}</li>)}</ul>
                    </div>
                    <div><h3 className="font-semibold">{t("identityFindings")}</h3><p>{t("findingCount", {count: formatNumber(candidate.matches.length)})}</p>
                      <p>{t("unresolvedCount", {count: formatNumber(candidate.matches.filter((item) => !item.resolved).length)})}</p>
                      <ul className="mt-1 list-inside list-disc">{candidate.matches.map((item) => <li key={item.id}>{t(identityKindKey(item.kind))} · {t(item.resolved ? "resolved" : "unresolved")}</li>)}</ul>
                    </div>
                  </div>
                </li>)}
              </ul>
              <nav aria-label={t("paginationLabel")} className="flex flex-wrap items-center gap-4 text-sm">
                <p>{t("shownCount", {count: formatNumber(result.page.candidates.length)})}</p>
                {result.page.nextCursor ? <Link href={`/staff/acquisition?cursor=${encodeURIComponent(result.page.nextCursor)}`} className="rounded-lg border border-stone-300 bg-white px-4 py-2 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">{t("nextPage")}</Link> : <p>{t("endOfQueue")}</p>}
              </nav>
            </>}
    </section>
  );
}

function Field({label, value}: Readonly<{label: string; value: ReactNode}>) {
  return <div className="min-w-0"><dt className="text-stone-500">{label}</dt><dd className="mt-1 break-words font-medium text-stone-900">{value}</dd></div>;
}

function State({title, description}: Readonly<{title: string; description: string}>) {
  return <div role="status" className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-stone-600">{description}</p></div>;
}

function evidenceKindKey(kind: string): "evidenceKinds.SOURCE" | "evidenceKinds.WEBSITE" | "evidenceKinds.SEGMENT" | "evidenceKinds.PACKAGING" | "evidenceKinds.other" {
  switch (kind) {
    case "SOURCE": return "evidenceKinds.SOURCE";
    case "WEBSITE": return "evidenceKinds.WEBSITE";
    case "SEGMENT": return "evidenceKinds.SEGMENT";
    case "PACKAGING": return "evidenceKinds.PACKAGING";
    default: return "evidenceKinds.other";
  }
}

function evidenceFindingKey(kind: string, finding: string): "observed" | "supports" | "contradicts" | "unknownFinding" {
  if (kind === "SOURCE") return finding === "OBSERVED" ? "observed" : "unknownFinding";
  if (kind !== "WEBSITE" && kind !== "SEGMENT" && kind !== "PACKAGING") return "unknownFinding";
  switch (finding) {
    case "SUPPORTS": return "supports";
    case "CONTRADICTS": return "contradicts";
    default: return "unknownFinding";
  }
}

function identityKindKey(kind: string): "identityKinds.EXACT_DUPLICATE" | "identityKinds.STRONG_CONFLICT" | "identityKinds.POSSIBLE_NAME_MATCH" | "identityKinds.other" {
  switch (kind) {
    case "EXACT_DUPLICATE": return "identityKinds.EXACT_DUPLICATE";
    case "STRONG_CONFLICT": return "identityKinds.STRONG_CONFLICT";
    case "POSSIBLE_NAME_MATCH": return "identityKinds.POSSIBLE_NAME_MATCH";
    default: return "identityKinds.other";
  }
}
