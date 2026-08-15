import type {Metadata} from "next";
import {getTranslations, setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";

import {
  getProductCatalogItem,
  listPublishedProductRoutes,
} from "@/composition/products/product-catalog";
import {ProductBreadcrumbs} from "@/features/products/presentation/components/product-breadcrumbs";
import {ProductDetails} from "@/features/products/presentation/components/product-details";
import {createProductBreadcrumbJsonLd} from "@/features/products/presentation/seo/breadcrumb-json-ld";
import {JsonLdScript} from "@/features/products/presentation/seo/json-ld-script";
import {createProductJsonLd} from "@/features/products/presentation/seo/product-json-ld";
import {createProductDetailMetadata} from "@/features/products/presentation/seo/product-metadata";
import {isLocale} from "@/i18n/locale";

type ProductPageProps = {params: Promise<{locale: string; slug: string}>};

export const dynamicParams = false;

export async function generateStaticParams({
  params,
}: {
  params: {locale: string};
}) {
  if (!isLocale(params.locale)) return [];
  const routes = await listPublishedProductRoutes();
  return routes
    .filter(({locale}) => locale === params.locale)
    .map(({slug}) => ({slug}));
}

export async function generateMetadata({params}: ProductPageProps): Promise<Metadata> {
  const {locale, slug} = await params;
  if (!isLocale(locale)) notFound();
  const {detail, availableLocales} = await getProductCatalogItem(slug, locale);
  if (detail.status !== "ready") {
    const translations = await getTranslations({locale, namespace: "NotFound"});
    return {title: translations("title"), robots: {index: false, follow: false}};
  }
  return createProductDetailMetadata({product: detail.product, availableLocales});
}

export default async function ProductPage({params}: ProductPageProps) {
  const {locale, slug} = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);

  const {detail} = await getProductCatalogItem(slug, locale);
  if (detail.status !== "ready") notFound();

  const [details, specifications, categories, breadcrumbs] = await Promise.all([
    getTranslations({locale, namespace: "ProductDetails"}),
    getTranslations({locale, namespace: "ProductSpecifications"}),
    getTranslations({locale, namespace: "ProductCategories"}),
    getTranslations({locale, namespace: "Breadcrumbs"}),
  ]);
  const product = detail.product;
  const breadcrumbData = createProductBreadcrumbJsonLd({
    locale,
    slug: product.identity.slug,
    homeLabel: breadcrumbs("home"),
    productsLabel: breadcrumbs("products"),
    productLabel: product.content.name,
  });

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
      <ProductBreadcrumbs
        homeLabel={breadcrumbs("home")}
        productsLabel={breadcrumbs("products")}
        productLabel={product.content.name}
        navigationLabel={breadcrumbs("label")}
      />
      <ProductDetails
        product={product}
        labels={{
          category: details("category"),
          sku: details("sku"),
          applications: details("applications"),
          categoryName: categories(product.category),
          specifications: {
            heading: specifications("heading"),
            capacity: specifications("capacity"),
            glassColor: specifications("glassColor"),
            neckFinish: specifications("neckFinish"),
            weight: specifications("weight"),
            height: specifications("height"),
            diameter: specifications("diameter"),
            milliliters: specifications("milliliters"),
            grams: specifications("grams"),
            millimeters: specifications("millimeters"),
          },
        }}
      />
      <JsonLdScript
        data={createProductJsonLd({
          product,
          categoryName: categories(product.category),
        })}
      />
      <JsonLdScript data={breadcrumbData} />
    </main>
  );
}
