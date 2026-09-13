import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

export default async function StaffLoading() {
  const locale = await getRootLocale();
  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <div role="status" aria-label={t("states.loading")} className="space-y-5 animate-pulse motion-reduce:animate-none">
      <div className="h-7 w-48 rounded-lg bg-stone-200" />
      <div className="h-4 w-full max-w-xl rounded bg-stone-200" />
      <div className="grid gap-4 pt-3 lg:grid-cols-3">
        {[0, 1, 2].map((item) => <div key={item} className="h-40 rounded-2xl border border-stone-200 bg-white" />)}
      </div>
      <span className="sr-only">{t("states.loading")}</span>
    </div>
  );
}
