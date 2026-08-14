import {getTranslations, setRequestLocale} from "next-intl/server";

import {Link} from "@/i18n/navigation";
import type {Locale} from "@/i18n/routing";

type HomePageProps = {
  params: Promise<{locale: Locale}>;
};

export default async function HomePage({params}: HomePageProps) {
  const {locale} = await params;
  setRequestLocale(locale);
  const translations = await getTranslations("HomePage");
  const navigation = await getTranslations("Navigation");
  const common = await getTranslations("Common");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-10 sm:px-10">
      <nav aria-label={navigation("primary")} className="flex items-center justify-between">
        <Link href="/" className="text-xl font-semibold tracking-tight">
          YolPol
        </Link>
        <span className="text-sm text-stone-600">{navigation("products")}</span>
      </nav>
      <section className="flex flex-1 flex-col justify-center py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
          {translations("eyebrow")}
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
          {translations("heading")}
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
          {translations("description")}
        </p>
        <div className="mt-8">
          <span className="inline-flex rounded-full bg-emerald-900 px-5 py-3 text-sm font-medium text-white">
            {common("requestQuote")}
          </span>
        </div>
      </section>
    </main>
  );
}
