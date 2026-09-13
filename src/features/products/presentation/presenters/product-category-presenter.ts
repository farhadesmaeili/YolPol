import type {ProductCategory} from "@/features/products/domain/types/product-types";
import {publicProductCategories} from "@/shared/config/site";

type PublicProductCategoryHref = (typeof publicProductCategories)[number]["href"];

export type ProductCategoryItem = Readonly<{
  id: ProductCategory;
  name: string;
  href?: PublicProductCategoryHref;
}>;

export function presentProductCategoryItems(
  categories: readonly ProductCategory[],
  getName: (category: ProductCategory) => string,
): readonly ProductCategoryItem[] {
  return categories.map((category) => {
    const publicCategory = publicProductCategories.find(({id}) => id === category);
    return {
      id: category,
      name: getName(category),
      ...(publicCategory ? {href: publicCategory.href} : {}),
    };
  });
}
