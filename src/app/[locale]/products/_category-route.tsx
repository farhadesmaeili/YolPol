import {getTranslations, setRequestLocale} from "next-intl/server";

import type {CategoryRoute} from "@/app/[locale]/_site-metadata";
import {listProductCatalog} from "@/composition/products/product-catalog";
import {ProductEmptyState} from "@/features/products/presentation/components/product-empty-state";
import {ProductGrid} from "@/features/products/presentation/components/product-grid";
import {ProductListHeader} from "@/features/products/presentation/components/product-list-header";
import {Link} from "@/i18n/navigation";
import {createBreadcrumbJsonLd} from "@/shared/seo/breadcrumb-json-ld";
import {JsonLdScript} from "@/shared/presentation/seo/json-ld-script";
import type {Locale} from "@/shared/types/locale";

const messageKey = {"olive-oil": "oliveOil", food: "food", beverage: "beverage"} as const;

export async function ProductCategoryRoute({locale, category}: {locale: Locale; category: CategoryRoute}) {
  setRequestLocale(locale);
  const key = messageKey[category];
  const [catalog, page, products, categories, breadcrumbs] = await Promise.all([
    listProductCatalog(locale, {category}),
    getTranslations({locale, namespace: `CategoryPages.${key}`}),
    getTranslations({locale, namespace: "Products"}),
    getTranslations({locale, namespace: "ProductCategories"}),
    getTranslations({locale, namespace: "Breadcrumbs"}),
  ]);
  const categoryLabels = {"olive-oil": categories("oliveOil"), food: categories("food"), beverage: categories("beverage"), pharmaceutical: categories("pharmaceutical")};
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 sm:px-10 sm:py-16">
      <nav aria-label={breadcrumbs("label")} className="mb-8 text-sm text-muted-foreground"><Link href="/">{breadcrumbs("home")}</Link><span aria-hidden="true"> / </span><Link href="/products">{breadcrumbs("products")}</Link><span aria-hidden="true"> / </span><span aria-current="page">{categories(key)}</span></nav>
      <ProductListHeader title={page("heading")} description={page("description")} />
      {catalog.products.length === 0 ? <ProductEmptyState title={products("empty.title")} description={products("empty.description")} backLabel={products("empty.backHome")} /> : <ProductGrid products={catalog.products} categoryLabels={categoryLabels} viewLabel={products("viewDetails")} inquiryLabel={products("requestPrice")} cardLabels={{product: products("card.product"), glassBottle: products("card.glassBottle"), inquiryPricing: products("card.inquiryPricing"), missingImage: products("card.missingImage")}} />}
      <JsonLdScript data={createBreadcrumbJsonLd({locale, items: [{name: breadcrumbs("home"), pathname: "/"}, {name: breadcrumbs("products"), pathname: "/products"}, {name: categories(key), pathname: `/products/${category}`} ]})} />
    </div>
  );
}
