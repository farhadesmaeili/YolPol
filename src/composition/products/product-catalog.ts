import {GetProductBySlug} from "@/features/products/application/use-cases/get-product-by-slug";
import type {ProductRepository} from "@/features/products/application/ports/product-repository";
import {ListProducts} from "@/features/products/application/use-cases/list-products";
import {StaticProductRepository} from "@/features/products/infrastructure/repositories/static-product-repository";
import {ProductPresenter} from "@/features/products/presentation/presenters/product-presenter";
import type {
  ProductDetailPresentation,
  ProductListPresentation,
} from "@/features/products/presentation/view-models/product-view-model";
import {supportedLocales, type Locale} from "@/shared/types/locale";
import type {ProductCategory} from "@/features/products/domain/types/product-types";

export type PublishedProductRoute = Readonly<{locale: Locale; slug: string}>;

export async function listProductCatalog(
  locale: Locale,
  options: Readonly<{category?: ProductCategory}> = {},
): Promise<ProductListPresentation> {
  return createProductCatalogComposition(new StaticProductRepository()).listProductCatalog(
    locale,
    options,
  );
}

export function createProductCatalogComposition(repository: ProductRepository) {
  const catalog = createProductCatalog(repository);
  return {
    async listProductCatalog(
      locale: Locale,
      options: Readonly<{category?: ProductCategory}> = {},
    ): Promise<ProductListPresentation> {
      const result = await catalog.listProducts.execute({
        locale,
        category: options.category,
      });
      return catalog.presenter.presentList(result);
    },
  } as const;
}

export async function getProductCatalogItem(
  slug: string,
  locale: Locale,
): Promise<{
  detail: ProductDetailPresentation;
  availableLocales: readonly Locale[];
}> {
  const catalog = createProductCatalog(new StaticProductRepository());
  const result = await catalog.getProductBySlug.execute({slug, locale});
  const detail = catalog.presenter.presentDetail(result);

  if (detail.status !== "ready") {
    return {detail, availableLocales: []};
  }

  const localeResults = await Promise.all(
    supportedLocales.map(async (candidateLocale) => ({
      locale: candidateLocale,
      result: await catalog.getProductBySlug.execute({
        slug,
        locale: candidateLocale,
      }),
    })),
  );

  return {
    detail,
    availableLocales: localeResults.flatMap(({locale: candidateLocale, result}) =>
      result.status === "found" ? [candidateLocale] : [],
    ),
  };
}

export async function listPublishedProductRoutes(): Promise<
  readonly PublishedProductRoute[]
> {
  const catalog = createProductCatalog(new StaticProductRepository());
  const routes = await Promise.all(
    supportedLocales.map(async (locale) => {
      const result = await catalog.listProducts.execute({locale});
      const presentation = catalog.presenter.presentList(result);
      return presentation.products.map((product) => ({
        locale,
        slug: product.identity.slug,
      }));
    }),
  );

  return routes.flat().sort((left, right) =>
    left.slug === right.slug
      ? supportedLocales.indexOf(left.locale) - supportedLocales.indexOf(right.locale)
      : left.slug.localeCompare(right.slug),
  );
}

function createProductCatalog(repository: ProductRepository) {
  return {
    listProducts: new ListProducts(repository),
    getProductBySlug: new GetProductBySlug(repository),
    presenter: new ProductPresenter(),
  };
}
