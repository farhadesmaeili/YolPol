import {getTranslations} from "next-intl/server";
import {locale as getRootLocale} from "next/root-params";

export default async function ProductDetailLoading() {
  const locale = await getRootLocale();
  const translations = await getTranslations({locale, namespace: "Products"});
  return (
    <div className="mx-auto min-h-[50vh] w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
      <p role="status" className="text-stone-600">
        {translations("loading.detail")}
      </p>
    </div>
  );
}
