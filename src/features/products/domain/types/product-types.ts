import type {ProductName} from "@/features/products/domain/value-objects/product-name";
import type {Locale} from "@/shared/types/locale";

export const productCategories = [
  "olive-oil",
  "food",
  "beverage",
  "pharmaceutical",
] as const;
export type ProductCategory = (typeof productCategories)[number];

export const productGlassColors = ["olive-green", "clear"] as const;
export type ProductGlassColor = (typeof productGlassColors)[number];

export const productBottleShapes = ["round", "square"] as const;
export type ProductBottleShape = (typeof productBottleShapes)[number];

export const productStatuses = ["draft", "published", "archived"] as const;
export type ProductStatus = (typeof productStatuses)[number];

export type ProductSpecifications = Readonly<{
  capacityMl?: number;
  glassColor?: ProductGlassColor;
  bottleShape?: ProductBottleShape;
  neckFinish?: string;
  weightGrams?: number;
  heightMm?: number;
  diameterMm?: number;
}>;

export type ProductPackagingInput = Readonly<{
  unitsPerPackage: number;
  packagesPerPallet: number;
  palletGrossWeightKg: number;
}>;

export type ProductPackaging = ProductPackagingInput &
  Readonly<{unitsPerPallet: number}>;

export type ProductPricing = Readonly<{mode: "inquiry"}>;

export type ProductImage = Readonly<{
  id: string;
  source: string;
  sortOrder: number;
  isPrimary: boolean;
  alternativeText?: Readonly<Partial<Record<Locale, string>>>;
}>;

export type ProductImageInput = ProductImage;

export type LocalizedProductContent = Readonly<{
  name: ProductName;
  shortDescription: string;
  fullDescription: string;
  applications: readonly string[];
  seoTitle: string;
  seoDescription: string;
}>;

export type LocalizedProductContentInput = Readonly<{
  name: string;
  shortDescription: string;
  fullDescription: string;
  applications: readonly string[];
  seoTitle: string;
  seoDescription: string;
}>;

export type ProductContentByLocale = Readonly<
  Partial<Record<Locale, LocalizedProductContent>>
>;

export type ProductContentInputByLocale = Readonly<
  Partial<Record<Locale, LocalizedProductContentInput>>
>;
