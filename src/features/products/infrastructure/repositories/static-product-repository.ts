import type {
  ProductListQuery,
  ProductRepository,
} from "@/features/products/application/ports/product-repository";
import type {Product} from "@/features/products/domain/entities/product";
import {ProductId} from "@/features/products/domain/value-objects/product-id";
import type {ProductId as ProductIdValue} from "@/features/products/domain/value-objects/product-id";
import {ProductSku} from "@/features/products/domain/value-objects/product-sku";
import {ProductSlug} from "@/features/products/domain/value-objects/product-slug";
import type {ProductSlug as ProductSlugValue} from "@/features/products/domain/value-objects/product-slug";
import {localizedProducts} from "@/features/products/infrastructure/data/localized-products";
import type {
  StaticLocalizedProductRecord,
  StaticTechnicalProductRecord,
} from "@/features/products/infrastructure/data/static-product-records";
import {technicalProducts} from "@/features/products/infrastructure/data/technical-products";
import {
  DuplicateStaticLocalizedRecordError,
  DuplicateStaticProductIdError,
  DuplicateStaticProductSkuError,
  DuplicateStaticProductSlugError,
  MissingStaticLocalizedContentError,
  OrphanStaticLocalizedRecordError,
} from "@/features/products/infrastructure/errors/static-product-data-errors";
import {toProductAggregate} from "@/features/products/infrastructure/mappers/static-product-mapper";

export class StaticProductRepository implements ProductRepository {
  private readonly technicalRecords: readonly StaticTechnicalProductRecord[];
  private readonly localizedRecords: readonly StaticLocalizedProductRecord[];

  constructor(
    technicalRecords: readonly StaticTechnicalProductRecord[] = technicalProducts,
    localizedRecords: readonly StaticLocalizedProductRecord[] = localizedProducts,
  ) {
    validateDataset(technicalRecords, localizedRecords);
    this.technicalRecords = freezeTechnicalRecords(technicalRecords);
    this.localizedRecords = freezeLocalizedRecords(localizedRecords);
  }

  async findById(id: ProductIdValue): Promise<Product | null> {
    const record = this.technicalRecords.find(
      (candidate) => ProductId.create(candidate.id).value === id.value,
    );
    return record ? this.hydrate(record) : null;
  }

  async findBySlug(slug: ProductSlugValue): Promise<Product | null> {
    const record = this.technicalRecords.find(
      (candidate) => ProductSlug.create(candidate.slug).value === slug.value,
    );
    return record ? this.hydrate(record) : null;
  }

  async list(query: ProductListQuery = {}): Promise<readonly Product[]> {
    return this.technicalRecords
      .filter(
        (record) =>
          (query.category === undefined || record.category === query.category) &&
          (query.status === undefined || record.status === query.status),
      )
      .map((record) => this.hydrate(record));
  }

  private hydrate(record: StaticTechnicalProductRecord): Product {
    return toProductAggregate(record, this.localizedRecords);
  }
}

function validateDataset(
  technicalRecords: readonly StaticTechnicalProductRecord[],
  localizedRecords: readonly StaticLocalizedProductRecord[],
): void {
  const normalizedIds = technicalRecords.map((record) => ProductId.create(record.id).value);
  const normalizedSkus = technicalRecords.map((record) => ProductSku.create(record.sku).value);
  const normalizedSlugs = technicalRecords.map((record) =>
    ProductSlug.create(record.slug).value,
  );

  const duplicateId = findDuplicate(normalizedIds);
  if (duplicateId) throw new DuplicateStaticProductIdError(duplicateId);

  const duplicateSku = findDuplicate(normalizedSkus);
  if (duplicateSku) throw new DuplicateStaticProductSkuError(duplicateSku);

  const duplicateSlug = findDuplicate(normalizedSlugs);
  if (duplicateSlug) throw new DuplicateStaticProductSlugError(duplicateSlug);

  const technicalIds = new Set(normalizedIds);
  const localizedKeys = localizedRecords.map((record) => {
    const productId = ProductId.create(record.productId).value;
    return {key: `${productId}\u0000${record.locale}`, productId, locale: record.locale};
  });
  const duplicateLocalizedKey = findDuplicate(localizedKeys.map(({key}) => key));

  if (duplicateLocalizedKey) {
    const [productId, locale] = duplicateLocalizedKey.split("\u0000");
    throw new DuplicateStaticLocalizedRecordError(productId, locale);
  }

  const orphanId = [...new Set(localizedKeys.map(({productId}) => productId))]
    .sort()
    .find((productId) => !technicalIds.has(productId));
  if (orphanId) throw new OrphanStaticLocalizedRecordError(orphanId);

  const localizedProductIds = new Set(localizedKeys.map(({productId}) => productId));
  const missingLocalizedId = [...technicalIds]
    .sort()
    .find((productId) => !localizedProductIds.has(productId));
  if (missingLocalizedId) {
    throw new MissingStaticLocalizedContentError(missingLocalizedId);
  }
}

function findDuplicate(values: readonly string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort()[0];
}

function freezeTechnicalRecords(
  records: readonly StaticTechnicalProductRecord[],
): readonly StaticTechnicalProductRecord[] {
  return Object.freeze(
    records.map((record) =>
      Object.freeze({
        ...record,
        specifications: Object.freeze({...record.specifications}),
        images: Object.freeze(record.images.map((image) => Object.freeze({...image}))),
      }),
    ),
  );
}

function freezeLocalizedRecords(
  records: readonly StaticLocalizedProductRecord[],
): readonly StaticLocalizedProductRecord[] {
  return Object.freeze(
    records.map((record) =>
      Object.freeze({
        ...record,
        applications: Object.freeze([...record.applications]),
        imageAlternativeText: record.imageAlternativeText
          ? Object.freeze({...record.imageAlternativeText})
          : undefined,
      }),
    ),
  );
}
