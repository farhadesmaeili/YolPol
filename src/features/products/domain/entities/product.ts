import {
  InvalidLocalizedContentError,
  InvalidProductCategoryError,
  InvalidProductImageError,
  InvalidProductPackagingError,
  InvalidProductPricingError,
  InvalidProductStatusError,
  InvalidProductStatusTransitionError,
  InvalidProductTimestampError,
  InvalidTechnicalSpecificationError,
  ProductPublicationError,
} from "@/features/products/domain/errors/product-errors";
import {
  productCategories,
  productBottleShapes,
  productGlassColors,
  productStatuses,
  type LocalizedProductContent,
  type ProductCategory,
  type ProductContentByLocale,
  type ProductContentInputByLocale,
  type ProductImage,
  type ProductImageInput,
  type ProductPackaging,
  type ProductPackagingInput,
  type ProductPricing,
  type ProductSpecifications,
  type ProductStatus,
} from "@/features/products/domain/types/product-types";
import {ProductId} from "@/features/products/domain/value-objects/product-id";
import {ProductName} from "@/features/products/domain/value-objects/product-name";
import {ProductSku} from "@/features/products/domain/value-objects/product-sku";
import {ProductSlug} from "@/features/products/domain/value-objects/product-slug";
import {
  defaultLocale,
  isSupportedLocale,
  supportedLocales,
  type Locale,
} from "@/shared/types/locale";

export type CreateProductInput = Readonly<{
  id: string;
  sku: string;
  slug: string;
  categories: readonly ProductCategory[];
  specifications: ProductSpecifications;
  packaging?: ProductPackagingInput;
  pricing: ProductPricing;
  images: readonly ProductImageInput[];
  content: ProductContentInputByLocale;
  createdAt: Date;
}>;

export type ReconstituteProductInput = CreateProductInput &
  Readonly<{
    status: ProductStatus;
    updatedAt: Date;
  }>;

const allowedTransitions: Readonly<Record<ProductStatus, readonly ProductStatus[]>> = {
  draft: ["published", "archived"],
  published: ["archived"],
  archived: ["draft"],
};

const numericSpecificationKeys = [
  "capacityMl",
  "weightGrams",
  "heightMm",
  "diameterMm",
] as const satisfies readonly (keyof ProductSpecifications)[];

const productCategorySet: ReadonlySet<string> = new Set(productCategories);
const productGlassColorSet: ReadonlySet<string> = new Set(productGlassColors);
const productBottleShapeSet: ReadonlySet<string> = new Set(productBottleShapes);
const productStatusSet: ReadonlySet<string> = new Set(productStatuses);

export class Product {
  readonly id: ProductId;
  readonly sku: ProductSku;
  readonly slug: ProductSlug;
  readonly categories: readonly ProductCategory[];
  readonly pricing: ProductPricing;

  private readonly productSpecifications: ProductSpecifications;
  private readonly productPackaging?: ProductPackaging;
  private readonly productImages: readonly ProductImage[];
  private readonly localizedContent: ProductContentByLocale;
  private readonly createdTimestamp: Date;
  private currentStatus: ProductStatus;
  private currentUpdatedAt: Date;

  private constructor(input: ReconstituteProductInput) {
    this.id = ProductId.create(input.id);
    this.sku = ProductSku.create(input.sku);
    this.slug = ProductSlug.create(input.slug);
    this.categories = freezeCategories(input.categories);
    this.pricing = Object.freeze({...input.pricing});
    this.currentStatus = input.status;
    this.productSpecifications = freezeSpecifications(input.specifications);
    this.productPackaging = freezePackaging(input.packaging);
    this.productImages = freezeImages(input.images);
    this.localizedContent = freezeContent(input.content);
    this.createdTimestamp = new Date(input.createdAt);
    this.currentUpdatedAt = new Date(input.updatedAt);
  }

  static create(input: CreateProductInput): Product {
    return Product.build({...input, status: "draft", updatedAt: input.createdAt});
  }

  static reconstitute(input: ReconstituteProductInput): Product {
    return Product.build(input);
  }

  private static build(input: ReconstituteProductInput): Product {
    validateCategories(input.categories, input.status);
    validateStatus(input.status);
    validateTimestamps(input.createdAt, input.updatedAt);
    validateSpecifications(input.specifications);
    validatePackaging(input.packaging);
    validatePricing(input.pricing);
    validateImages(input.images);
    validateLocalizedContent(input.content);

    if (input.status === "published") {
      validatePublication(input.categories, input.content, input.images);
    }

    return new Product(input);
  }

  get status(): ProductStatus {
    return this.currentStatus;
  }

  get specifications(): ProductSpecifications {
    return this.productSpecifications;
  }

  get packaging(): ProductPackaging | undefined {
    return this.productPackaging;
  }

  get images(): readonly ProductImage[] {
    return this.productImages;
  }

  get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  get updatedAt(): Date {
    return new Date(this.currentUpdatedAt);
  }

  getContent(locale: Locale): LocalizedProductContent | undefined {
    return this.localizedContent[locale];
  }

  transitionTo(status: ProductStatus, updatedAt: Date): void {
    if (status === this.currentStatus) {
      return;
    }

    if (!allowedTransitions[this.currentStatus].includes(status)) {
      throw new InvalidProductStatusTransitionError(this.currentStatus, status);
    }

    validateTimestamps(this.currentUpdatedAt, updatedAt);

    if (status === "published") {
      validatePublication(this.categories, this.localizedContent, this.productImages);
    }

    this.currentStatus = status;
    this.currentUpdatedAt = new Date(updatedAt);
  }
}

function validateCategories(
  categories: readonly ProductCategory[],
  status: ProductStatus,
): void {
  if (status === "published" && categories.length === 0) {
    throw new InvalidProductCategoryError("published Products require a category");
  }

  const seen = new Set<ProductCategory>();
  for (const category of categories) {
    if (!productCategorySet.has(category)) {
      throw new InvalidProductCategoryError(`unsupported category "${category}"`);
    }
    if (seen.has(category)) {
      throw new InvalidProductCategoryError(`duplicate category "${category}"`);
    }
    seen.add(category);
  }
}

function validateStatus(status: string): asserts status is ProductStatus {
  if (!productStatusSet.has(status)) {
    throw new InvalidProductStatusError();
  }
}

function validateTimestamps(createdAt: Date, updatedAt: Date): void {
  if (
    !Number.isFinite(createdAt.getTime()) ||
    !Number.isFinite(updatedAt.getTime()) ||
    updatedAt < createdAt
  ) {
    throw new InvalidProductTimestampError();
  }
}

function validateSpecifications(specifications: ProductSpecifications): void {
  for (const key of numericSpecificationKeys) {
    const value = specifications[key];

    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new InvalidTechnicalSpecificationError(key);
    }
  }

  if (
    specifications.glassColor !== undefined &&
    !productGlassColorSet.has(specifications.glassColor)
  ) {
    throw new InvalidTechnicalSpecificationError("glassColor");
  }
  if (
    specifications.bottleShape !== undefined &&
    !productBottleShapeSet.has(specifications.bottleShape)
  ) {
    throw new InvalidTechnicalSpecificationError("bottleShape");
  }
  if (
    specifications.neckFinish !== undefined &&
    specifications.neckFinish.trim().length === 0
  ) {
    throw new InvalidTechnicalSpecificationError("neckFinish");
  }
}

function validatePackaging(packaging?: ProductPackagingInput): void {
  if (!packaging) return;
  for (const key of ["unitsPerPackage", "packagesPerPallet"] as const) {
    if (!Number.isInteger(packaging[key]) || packaging[key] <= 0) {
      throw new InvalidProductPackagingError(key);
    }
  }
  if (
    !Number.isFinite(packaging.palletGrossWeightKg) ||
    packaging.palletGrossWeightKg <= 0
  ) {
    throw new InvalidProductPackagingError("palletGrossWeightKg");
  }
}

function validatePricing(pricing: ProductPricing): void {
  if (pricing.mode !== "inquiry") {
    throw new InvalidProductPricingError();
  }
}

function validateImages(images: readonly ProductImageInput[]): void {
  const identifiers = new Set<string>();
  const sortOrders = new Set<number>();
  let primaryCount = 0;

  for (const image of images) {
    if (image.id.trim().length === 0) {
      throw new InvalidProductImageError("identifier is required");
    }
    if (image.source.trim().length === 0) {
      throw new InvalidProductImageError("source is required");
    }
    if (identifiers.has(image.id)) {
      throw new InvalidProductImageError(`duplicate identifier "${image.id}"`);
    }
    if (!Number.isInteger(image.sortOrder) || image.sortOrder < 0) {
      throw new InvalidProductImageError("sort order must be a non-negative integer");
    }
    if (sortOrders.has(image.sortOrder)) {
      throw new InvalidProductImageError(`duplicate sort order "${image.sortOrder}"`);
    }

    identifiers.add(image.id);
    sortOrders.add(image.sortOrder);
    primaryCount += image.isPrimary ? 1 : 0;

    for (const [locale, text] of Object.entries(image.alternativeText ?? {})) {
      if (!isSupportedLocale(locale)) {
        throw new InvalidProductImageError(`unsupported alternative-text locale "${locale}"`);
      }
      if (text.trim().length === 0) {
        throw new InvalidProductImageError("alternative text cannot be blank");
      }
    }
  }

  if (primaryCount > 1) {
    throw new InvalidProductImageError("at most one image can be primary");
  }
}

function validateLocalizedContent(content: ProductContentInputByLocale): void {
  const entries = Object.entries(content);

  if (entries.length === 0) {
    throw new InvalidLocalizedContentError("at least one supported locale is required");
  }

  for (const [locale, localizedContent] of entries) {
    if (!isSupportedLocale(locale) || localizedContent === undefined) {
      throw new InvalidLocalizedContentError(`unsupported locale "${locale}"`);
    }

    ProductName.create(localizedContent.name);
    const requiredTexts = [
      localizedContent.shortDescription,
      localizedContent.fullDescription,
      localizedContent.seoTitle,
      localizedContent.seoDescription,
    ];

    if (requiredTexts.some((text) => text.trim().length === 0)) {
      throw new InvalidLocalizedContentError(`${locale} contains a blank required field`);
    }
    if (
      localizedContent.applications.length === 0 ||
      localizedContent.applications.some((application) => application.trim().length === 0)
    ) {
      throw new InvalidLocalizedContentError(`${locale} requires non-blank applications`);
    }
  }
}

function validatePublication(
  categories: readonly ProductCategory[],
  content: ProductContentInputByLocale | ProductContentByLocale,
  images: readonly ProductImageInput[] | readonly ProductImage[],
): void {
  if (categories.length === 0) {
    throw new ProductPublicationError("at least one category is required");
  }
  if (!content[defaultLocale]) {
    throw new ProductPublicationError(`${defaultLocale} content is required`);
  }
  if (images.length === 0) {
    throw new ProductPublicationError("at least one image is required");
  }
  if (images.filter((image) => image.isPrimary).length !== 1) {
    throw new ProductPublicationError("exactly one primary image is required");
  }
}

function freezeSpecifications(
  specifications: ProductSpecifications,
): ProductSpecifications {
  return Object.freeze({...specifications});
}

function freezeCategories(
  categories: readonly ProductCategory[],
): readonly ProductCategory[] {
  return Object.freeze([...categories]);
}

function freezePackaging(
  packaging?: ProductPackagingInput,
): ProductPackaging | undefined {
  return packaging
    ? Object.freeze({
        ...packaging,
        unitsPerPallet: packaging.unitsPerPackage * packaging.packagesPerPallet,
      })
    : undefined;
}

function freezeImages(images: readonly ProductImageInput[]): readonly ProductImage[] {
  return Object.freeze(
    images.map((image) =>
      Object.freeze({
        ...image,
        alternativeText: image.alternativeText
          ? Object.freeze({...image.alternativeText})
          : undefined,
      }),
    ),
  );
}

function freezeContent(content: ProductContentInputByLocale): ProductContentByLocale {
  return Object.freeze(
    Object.fromEntries(
      supportedLocales.flatMap((locale) => {
        const localizedContent = content[locale];
        return localizedContent
          ? [
              [
                locale,
                Object.freeze({
                  ...localizedContent,
                  name: ProductName.create(localizedContent.name),
                  applications: Object.freeze([...localizedContent.applications]),
                }),
              ],
            ]
          : [];
      }),
    ),
  );
}
