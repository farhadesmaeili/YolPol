import type {ProductDto} from "@/features/products/application/dto/product-dto";
import type {
  GetProductBySlugResult,
  ListProductsResult,
} from "@/features/products/application/results/product-query-results";
import type {
  ProductDetailPresentation,
  ProductListPresentation,
  ProductViewModel,
} from "@/features/products/presentation/view-models/product-view-model";

export class ProductPresenter {
  constructor(private readonly truckPalletCapacity: number) {
    if (!Number.isSafeInteger(truckPalletCapacity) || truckPalletCapacity <= 0) {
      throw new TypeError("Truck pallet capacity must be a positive safe integer.");
    }
  }

  presentDetail(result: GetProductBySlugResult): ProductDetailPresentation {
    if (result.status !== "found") {
      return result;
    }

    return {status: "ready", product: this.toViewModel(result.product)};
  }

  presentList(result: ListProductsResult): ProductListPresentation {
    return {products: result.products.map((product) => this.toViewModel(product))};
  }

  private toViewModel(product: ProductDto): ProductViewModel {
    return {
      identity: {id: product.id, sku: product.sku, slug: product.slug},
      categories: [...product.categories],
      status: product.status,
      content: {
        locale: product.locale,
        name: product.name,
        shortDescription: product.shortDescription,
        fullDescription: product.fullDescription,
        applications: [...product.applications],
        seo: {title: product.seoTitle, description: product.seoDescription},
      },
      specifications: {...product.specifications},
      packaging: product.packaging
        ? {
            ...product.packaging,
            unitsPerTruck: multiplySafely(
              product.packaging.unitsPerPallet,
              this.truckPalletCapacity,
            ),
          }
        : undefined,
      pricing: {...product.pricing},
      images: product.images
        .map((image) => ({...image}))
        .sort((left, right) => left.sortOrder - right.sortOrder),
      timestamps: {createdAt: product.createdAt, updatedAt: product.updatedAt},
    };
  }
}

function multiplySafely(left: number, right: number): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    throw new RangeError("Product truck capacity exceeds safe integer limits.");
  }
  return result;
}
