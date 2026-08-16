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
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import {createProductJsonLd} from "@/features/products/presentation/seo/product-json-ld";
import {createProductDetailMetadata} from "@/features/products/presentation/seo/product-metadata";
import {isLocale} from "@/i18n/locale";
import type {ProductCategory} from "@/features/products/domain/types/product-types";

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

  const [details, specifications, packaging, pricing, categories, breadcrumbs] = await Promise.all([
    getTranslations({locale, namespace: "ProductDetails"}),
    getTranslations({locale, namespace: "ProductSpecifications"}),
    getTranslations({locale, namespace: "ProductPackaging"}),
    getTranslations({locale, namespace: "ProductPricing"}),
    getTranslations({locale, namespace: "ProductCategories"}),
    getTranslations({locale, namespace: "Breadcrumbs"}),
  ]);
  const product = detail.product;
  const categoryNames = product.categories.map((category) =>
    categories(categoryMessageKey(category)),
  );
  const breadcrumbData = createProductBreadcrumbJsonLd({
    locale,
    slug: product.identity.slug,
    homeLabel: breadcrumbs("home"),
    productsLabel: breadcrumbs("products"),
    productLabel: product.content.name,
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14">
      <ProductBreadcrumbs
        homeLabel={breadcrumbs("home")}
        productsLabel={breadcrumbs("products")}
        productLabel={product.content.name}
        navigationLabel={breadcrumbs("label")}
      />
      <ProductDetails
        product={product}
        locale={locale}
        labels={{
          categories: details("categories"),
          sku: details("sku"),
          applications: details("applications"),
          categoryNames,
          inquiryPricing: pricing("inquiry"),
          requestAction: pricing("inquiry"),
          specifications: {
            heading: specifications("heading"),
            capacity: specifications("capacity"),
            glassColor: specifications("glassColor"),
            bottleShape: specifications("bottleShape"),
            neckFinish: specifications("neckFinish"),
            weight: specifications("weight"),
            height: specifications("height"),
            diameter: specifications("diameter"),
            milliliters: specifications("milliliters"),
            grams: specifications("grams"),
            millimeters: specifications("millimeters"),
            glassColors: {
              "olive-green": specifications("glassColors.oliveGreen"),
              clear: specifications("glassColors.clear"),
            },
            bottleShapes: {
              round: specifications("bottleShapes.round"),
              square: specifications("bottleShapes.square"),
            },
          },
          packaging: {
            heading: packaging("heading"),
            unitsPerPackage: packaging("unitsPerPackage"),
            packagesPerPallet: packaging("packagesPerPallet"),
            unitsPerPallet: packaging("unitsPerPallet"),
            palletGrossWeight: packaging("palletGrossWeight"),
            kilograms: packaging("kilograms"),
          },
        }}
      />
      <JsonLdScript
        data={createProductJsonLd({
          product,
          categoryNames,
          labels: {
            capacity: specifications("capacity"),
            milliliters: specifications("milliliters"),
            bottleShape: specifications("bottleShape"),
            materialName: specifications("materials.glass"),
            colorName:
              product.specifications.glassColor === undefined
                ? undefined
                : specifications(
                    product.specifications.glassColor === "olive-green"
                      ? "glassColors.oliveGreen"
                      : "glassColors.clear",
                  ),
            shapeName:
              product.specifications.bottleShape === undefined
                ? undefined
                : specifications(
                    product.specifications.bottleShape === "round"
                      ? "bottleShapes.round"
                      : "bottleShapes.square",
                  ),
          },
        })}
      />
      <JsonLdScript data={breadcrumbData} />
    </div>
  );
}

function categoryMessageKey(
  category: ProductCategory,
): "oliveOil" | "food" | "beverage" | "pharmaceutical" {
  return category === "olive-oil" ? "oliveOil" : category;
}
