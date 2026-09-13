import {ProductCard} from "@/features/products/presentation/components/product-card";
import type {ProductCardLabels} from "@/features/products/presentation/components/product-card";
import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";

export function ProductGrid({
  products,
  categoryLabels,
  viewLabel,
  inquiryLabel,
  cardLabels,
  className = "mt-12",
}: {
  products: readonly ProductViewModel[];
  categoryLabels: Readonly<Record<ProductViewModel["categories"][number], string>>;
  viewLabel: string;
  inquiryLabel: string;
  cardLabels: ProductCardLabels;
  className?: string;
}) {
  return (
    <ul className={`${className} grid gap-6 sm:grid-cols-2 lg:grid-cols-3`}>
      {products.map((product) => (
        <li key={product.identity.id}>
          <ProductCard
            product={product}
            categoryLabels={product.categories.map((category) => categoryLabels[category])}
            viewLabel={viewLabel}
            inquiryLabel={inquiryLabel}
            labels={cardLabels}
          />
        </li>
      ))}
    </ul>
  );
}
