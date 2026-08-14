import type {ProductDto} from "@/features/products/application/dto/product-dto";

export type ProductViewModel = Readonly<{
  identity: Readonly<{id: string; sku: string; slug: string}>;
  category: ProductDto["category"];
  status: ProductDto["status"];
  content: Readonly<{
    locale: ProductDto["locale"];
    name: string;
    shortDescription: string;
    fullDescription: string;
    applications: readonly string[];
    seo: Readonly<{title: string; description: string}>;
  }>;
  specifications: ProductDto["specifications"];
  images: readonly Readonly<{
    id: string;
    source: string;
    sortOrder: number;
    isPrimary: boolean;
    alternativeText?: string;
  }>[];
  timestamps: Readonly<{createdAt: string; updatedAt: string}>;
}>;

export type ProductDetailPresentation =
  | Readonly<{status: "ready"; product: ProductViewModel}>
  | Readonly<{status: "not_found"}>
  | Readonly<{status: "locale_not_available"}>;

export type ProductListPresentation = Readonly<{
  products: readonly ProductViewModel[];
}>;
