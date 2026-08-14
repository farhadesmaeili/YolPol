import type {ProductDto} from "@/features/products/application/dto/product-dto";

export type GetProductBySlugResult =
  | Readonly<{status: "found"; product: ProductDto}>
  | Readonly<{status: "not_found"}>
  | Readonly<{status: "locale_not_available"}>;

export type ListProductsResult = Readonly<{
  products: readonly ProductDto[];
}>;
