import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

export default async function StaffInquiriesLoading() {
  const locale = await getRootLocale();
  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <div role="status" aria-label={t("states.loading")} className="animate-pulse space-y-5 motion-reduce:animate-none">
      <div><div className="h-7 w-52 rounded-lg bg-stone-200" /><div className="mt-3 h-4 w-full max-w-2xl rounded bg-stone-200" /></div>
      <div className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => <div key={item} className="h-11 rounded-xl bg-stone-100" />)}
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {[0, 1, 2, 3, 4].map((item) => <div key={item} className="grid min-h-20 grid-cols-3 gap-4 border-b border-stone-100 p-4 last:border-b-0"><div className="rounded bg-stone-100" /><div className="rounded bg-stone-100" /><div className="rounded bg-stone-100" /></div>)}
      </div>
      <span className="sr-only">{t("states.loading")}</span>
    </div>
  );
}
