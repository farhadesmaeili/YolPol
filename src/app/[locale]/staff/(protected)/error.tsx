"use client";

import {useTranslations} from "next-intl";

export default function StaffError({reset}: Readonly<{reset: () => void}>) {
  const t = useTranslations("Staff");
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-5 py-10 text-center shadow-sm">
      <h1 className="text-xl font-bold text-stone-950">{t("states.serviceUnavailableTitle")}</h1>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-600">{t("states.serviceUnavailableDescription")}</p>
      <button type="button" onClick={reset} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-emerald-900 px-5 text-sm font-semibold text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2">{t("states.retry")}</button>
    </div>
  );
}
