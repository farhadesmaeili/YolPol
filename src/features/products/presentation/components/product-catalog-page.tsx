import { ProductCatalogBottomRail } from "@/features/products/presentation/components/product-catalog-bottom-rail";
import { ProductCatalogFrame } from "@/features/products/presentation/components/product-catalog-frame";
import { ProductCatalogHeader } from "@/features/products/presentation/components/product-catalog-header";
import { ProductCategoryIndex } from "@/features/products/presentation/components/product-category-index";
import type { ProductCategoryIndexItem } from "@/features/products/presentation/components/product-category-index";
import { ProductEmptyState } from "@/features/products/presentation/components/product-empty-state";
import { ProductGrid } from "@/features/products/presentation/components/product-grid";
import type { ProductViewModel } from "@/features/products/presentation/view-models/product-view-model";

export type ProductCatalogPageModel = Readonly<{
  isRtl: boolean;
  products: readonly ProductViewModel[];
  categoryItems: readonly ProductCategoryIndexItem[];
  categoryLabels: Readonly<Record<ProductViewModel["categories"][number], string>>;
  heading: string;
  description: string;
  collectionLabel: string;
  catalogIndex: string;
  categoryNavigationLabel: string;
  formattedProductCount: string;
  productCountLabel: string;
  productCountSummary: string;
  publishedLabel: string;
  publishedValue: string;
  destinationLabel: string;
  destinationValue: string;
  inquiryLabel: string;
  inquiryValue: string;
  viewDetails: string;
  requestPrice: string;
  cardLabels: Readonly<{
    product: string;
    glassBottle: string;
    inquiryPricing: string;
    missingImage: string;
  }>;
  bottomRail: string;
  empty: Readonly<{ title: string; description: string; backLabel: string }>;
}>;

export function ProductCatalogPage({ model }: { model: ProductCatalogPageModel }) {
  return (
    <div dir={model.isRtl ? "rtl" : "ltr"} className="relative isolate overflow-hidden bg-[#f3f1eb] text-stone-950">
      <ProductCategoryIndex
        label={model.collectionLabel}
        indexLabel={model.catalogIndex}
        navigationLabel={model.categoryNavigationLabel}
        items={model.categoryItems}
        isRtl={model.isRtl}
      />

      <section id="catalog" className="relative py-14 sm:py-18 lg:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute start-1/2 top-[15%] size-[min(44rem,90vw)] -translate-x-1/2 rounded-full bg-emerald-800/[0.035] blur-[170px]" />
        </div>
        <div className="mx-auto w-full max-w-[1900px] px-4 sm:px-8 lg:px-14 xl:px-20 2xl:px-24">
          <ProductCatalogHeader
            indexLabel={model.catalogIndex}
            title={model.heading}
            description={model.description}
            formattedCount={model.formattedProductCount}
            countLabel={model.productCountLabel}
            countSummary={model.productCountSummary}
            isRtl={model.isRtl}
            statuses={[
              { label: model.publishedLabel, value: model.publishedValue },
              { label: model.destinationLabel, value: model.destinationValue, ltr: true },
              { label: model.inquiryLabel, value: model.inquiryValue },
            ]}
          />

          <ProductCatalogFrame>
            {model.products.length === 0 ? (
              <div className="border border-stone-950/[0.09] bg-white/25 p-5 shadow-[0_30px_90px_-50px_rgba(28,25,23,0.35)] backdrop-blur-sm sm:p-10">
                <ProductEmptyState
                  title={model.empty.title}
                  description={model.empty.description}
                  backLabel={model.empty.backLabel}
                />
              </div>
            ) : (
              <ProductGrid
                products={model.products}
                categoryLabels={model.categoryLabels}
                viewLabel={model.viewDetails}
                inquiryLabel={model.requestPrice}
                cardLabels={model.cardLabels}
                className="mt-0"
              />
            )}
          </ProductCatalogFrame>
        </div>
      </section>

      <ProductCatalogBottomRail label={model.bottomRail} />
    </div>
  );
}
