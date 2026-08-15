import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

import {Link} from "@/i18n/navigation";

export default async function LocalizedNotFound() {
  const locale = await getRootLocale();
  const translations = await getTranslations({locale, namespace: "NotFound"});
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
      <h1 className="text-4xl font-semibold tracking-tight text-stone-950">
        {translations("title")}
      </h1>
      <p className="mt-4 text-lg leading-8 text-stone-600">
        {translations("description")}
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex w-fit rounded-full bg-emerald-900 px-5 py-3 text-sm font-medium text-white outline-none hover:bg-emerald-800 focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2"
      >
        {translations("backHome")}
      </Link>
    </div>
  );
}
