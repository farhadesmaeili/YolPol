import { ProductCatalogBottomRail } from "@/features/products/presentation/components/product-catalog-bottom-rail";
import { ProductCatalogFrame } from "@/features/products/presentation/components/product-catalog-frame";
import { ProductCatalogHeader } from "@/features/products/presentation/components/product-catalog-header";
import { ProductCatalogSection, ProductCatalogSurface } from "@/features/products/presentation/components/product-catalog-section";
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
    <ProductCatalogSurface isRtl={model.isRtl}>
      <ProductCategoryIndex
        label={model.collectionLabel}
        indexLabel={model.catalogIndex}
        navigationLabel={model.categoryNavigationLabel}
        items={model.categoryItems}
        isRtl={model.isRtl}
      />

      <ProductCatalogSection>
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
      </ProductCatalogSection>

      <ProductCatalogBottomRail label={model.bottomRail} />
    </ProductCatalogSurface>
  );
}
