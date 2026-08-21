import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

type HomePageProps = {
  params: Promise<{ locale: Locale }>;
};

export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const translations = await getTranslations("HomePage");
  const common = await getTranslations("Common");

  return (
    <section className="mx-auto flex min-h-[70vh] max-w-5xl flex-col justify-center px-6 py-20 sm:px-10">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-800">
        {translations("eyebrow")}
      </p>
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-6xl">
        {translations("heading")}
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-600">
        {translations("description")}
      </p>
      <div className="mt-8 flex flex-wrap gap-4">
        <Link
          href="/products"
          className="inline-flex min-h-12 items-center bg-brand px-5 py-3 text-sm font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {common("viewProducts")}
        </Link>
        <Link
          href="/contact"
          className="inline-flex min-h-12 items-center border border-brand px-5 py-3 text-sm font-semibold text-brand outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
        >
          {common("contactUs")}
        </Link>
      </div>
    </section>
  );
}
