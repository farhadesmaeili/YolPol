import type { ProductViewModel } from "@/features/products/presentation/view-models/product-view-model";

export function selectProductCardImage(images: ProductViewModel["images"]) {
  return images.find((candidate) => candidate.isPrimary) ?? images.at(0);
}
