import type {
  ProductCategory,
  ProductPackaging,
  PublicProductPricing,
  ProductSpecifications,
  ProductStatus,
} from "@/features/products/domain/types/product-types";
import type {Locale} from "@/shared/types/locale";

export type ProductImageDto = Readonly<{
  id: string;
  source: string;
  sortOrder: number;
  isPrimary: boolean;
  alternativeText?: string;
}>;

export type ProductDto = Readonly<{
  id: string;
  sku: string;
  slug: string;
  categories: readonly ProductCategory[];
  status: ProductStatus;
  locale: Locale;
  name: string;
  shortDescription: string;
  fullDescription: string;
  applications: readonly string[];
  seoTitle: string;
  seoDescription: string;
  specifications: ProductSpecifications;
  packaging?: ProductPackaging;
  pricing: PublicProductPricing;
  images: readonly ProductImageDto[];
  createdAt: string;
  updatedAt: string;
}>;
