import type {
  ProductCategory,
  ProductSpecifications,
  ProductStatus,
} from "@/features/products/domain/types/product-types";
import type {Locale} from "@/shared/types/locale";

export type StaticProductImageRecord = Readonly<{
  id: string;
  source: string;
  sortOrder: number;
  isPrimary: boolean;
}>;

export type StaticTechnicalProductRecord = Readonly<{
  id: string;
  sku: string;
  slug: string;
  category: ProductCategory;
  status: ProductStatus;
  specifications: ProductSpecifications;
  images: readonly StaticProductImageRecord[];
  createdAt: string;
  updatedAt: string;
}>;

export type StaticLocalizedProductRecord = Readonly<{
  productId: string;
  locale: Locale;
  name: string;
  shortDescription: string;
  fullDescription: string;
  applications: readonly string[];
  seoTitle: string;
  seoDescription: string;
  imageAlternativeText?: Readonly<Record<string, string>>;
}>;
