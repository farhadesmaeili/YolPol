import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { listProductCatalog } from "@/composition/products/product-catalog";
import { ProductCatalogPage } from "@/features/products/presentation/components/product-catalog-page";
import { createProductListingMetadata } from "@/features/products/presentation/seo/product-metadata";
import { isLocale } from "@/i18n/locale";
import { publicProductCategories } from "@/shared/config/site";
import { formatHumanNumber } from "@/shared/presentation/bidi/bidi-isolate";
import { supportedLocales } from "@/shared/types/locale";

type ProductsPageProps = { params: Promise<{ locale: string }> };

export const dynamic = "force-static";

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: ProductsPageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const translations = await getTranslations({ locale, namespace: "Products.metadata" });
  return createProductListingMetadata({
    locale,
    title: translations("title"),
    description: translations("description"),
  });
}

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const [catalog, products, categories] = await Promise.all([
    listProductCatalog(locale),
    getTranslations({ locale, namespace: "Products" }),
    getTranslations({ locale, namespace: "ProductCategories" }),
  ]);
  const formattedProductCount = formatHumanNumber(locale, catalog.products.length);
  const categoryLabels = {
    "olive-oil": categories("oliveOil"),
    food: categories("food"),
    beverage: categories("beverage"),
    pharmaceutical: categories("pharmaceutical"),
  } as const;

  return (
    <ProductCatalogPage
      model={{
        isRtl: locale === "fa" || locale === "ar",
        products: catalog.products,
        categoryLabels,
        categoryItems: publicProductCategories.map(({ id, href }) => ({
          id,
          href,
          label: categoryLabels[id],
        })),
        heading: products("heading"),
        description: products("description"),
        collectionLabel: products("catalog.collectionLabel"),
        catalogIndex: products("catalog.indexLabel"),
        categoryNavigationLabel: products("catalog.categoryNavigationLabel"),
        formattedProductCount,
        productCountLabel: products("catalog.productCountLabel"),
        productCountSummary: products("catalog.productCountSummary", { count: formattedProductCount }),
        publishedLabel: products("catalog.publishedLabel"),
        publishedValue: products("catalog.publishedValue"),
        destinationLabel: products("catalog.destinationLabel"),
        destinationValue: products("catalog.destinationValue"),
        inquiryLabel: products("catalog.inquiryLabel"),
        inquiryValue: products("catalog.inquiryValue"),
        bottomRail: products("catalog.bottomRail"),
        viewDetails: products("viewDetails"),
        requestPrice: products("requestPrice"),
        cardLabels: {
          product: products("card.product"),
          glassBottle: products("card.glassBottle"),
          inquiryPricing: products("card.inquiryPricing"),
          missingImage: products("card.missingImage"),
        },
        empty: {
          title: products("empty.title"),
          description: products("empty.description"),
          backLabel: products("empty.backHome"),
        },
      }}
    />
  );
}
