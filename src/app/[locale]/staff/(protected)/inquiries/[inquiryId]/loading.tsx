import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

export default async function StaffInquiryDetailLoading() {
  const locale = await getRootLocale();
  const t = await getTranslations({locale, namespace: "Staff"});
  return (
    <div role="status" aria-label={t("states.loading")} className="animate-pulse space-y-5 motion-reduce:animate-none">
      <div><div className="h-7 w-52 rounded-lg bg-stone-200" /><div className="mt-3 h-4 w-full max-w-xl rounded bg-stone-200" /></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-4">{["h-40", "h-48", "h-32", "h-44"].map((height) => <div key={height} className={`${height} rounded-2xl border border-stone-200 bg-white`} />)}</div>
        <div className="space-y-4">{["h-48", "h-64"].map((height) => <div key={height} className={`${height} rounded-2xl border border-stone-200 bg-white`} />)}</div>
      </div>
      <span className="sr-only">{t("states.loading")}</span>
    </div>
  );
}
