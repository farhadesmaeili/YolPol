import {ProductCard} from "@/features/products/presentation/components/product-card";
import type {ProductViewModel} from "@/features/products/presentation/view-models/product-view-model";

export function ProductGrid({
  products,
  categoryLabels,
  viewLabel,
}: {
  products: readonly ProductViewModel[];
  categoryLabels: Readonly<Record<ProductViewModel["category"], string>>;
  viewLabel: string;
}) {
  return (
    <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product) => (
        <li key={product.identity.id}>
          <ProductCard
            product={product}
            categoryLabel={categoryLabels[product.category]}
            viewLabel={viewLabel}
          />
        </li>
      ))}
    </ul>
  );
}
