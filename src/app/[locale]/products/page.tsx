import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {listProductCatalog} from "@/composition/products/product-catalog";
import {ProductEmptyState} from "@/features/products/presentation/components/product-empty-state";
import {ProductGrid} from "@/features/products/presentation/components/product-grid";
import {ProductListHeader} from "@/features/products/presentation/components/product-list-header";
import {createProductListingMetadata} from "@/features/products/presentation/seo/product-metadata";
import {isLocale} from "@/i18n/locale";
import {supportedLocales} from "@/shared/types/locale";

type ProductsPageProps = {params: Promise<{locale: string}>};

export const dynamic = "force-static";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({locale}));
}

export async function generateMetadata({params}: ProductsPageProps): Promise<Metadata> {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  const translations = await getTranslations({locale, namespace: "Products.metadata"});
  return createProductListingMetadata({
    locale,
    title: translations("title"),
    description: translations("description"),
  });
}

export default async function ProductsPage({params}: ProductsPageProps) {
  const {locale} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [catalog, translations, categories] = await Promise.all([
    listProductCatalog(locale),
    getTranslations({locale, namespace: "Products"}),
    getTranslations({locale, namespace: "ProductCategories"}),
  ]);

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
      <ProductListHeader
        title={translations("heading")}
        description={translations("description")}
      />
      {catalog.products.length === 0 ? (
        <ProductEmptyState
          title={translations("empty.title")}
          description={translations("empty.description")}
          backLabel={translations("empty.backHome")}
        />
      ) : (
        <ProductGrid
          products={catalog.products}
          categoryLabels={categoryLabels(categories)}
          viewLabel={translations("viewDetails")}
        />
      )}
    </main>
  );
}

function categoryLabels(
  translations: Awaited<ReturnType<typeof getTranslations<"ProductCategories">>>,
): Readonly<Record<"beverage" | "pharmaceutical", string>> {
  return {
    beverage: translations("beverage"),
    pharmaceutical: translations("pharmaceutical"),
  };
}
