import {
  InvalidLocalizedContentError,
  InvalidProductCategoryError,
  InvalidProductImageError,
  InvalidProductStatusError,
  InvalidProductStatusTransitionError,
  InvalidProductTimestampError,
  InvalidTechnicalSpecificationError,
  ProductPublicationError,
} from "@/features/products/domain/errors/product-errors";
import {
  productCategories,
  productStatuses,
  type LocalizedProductContent,
  type ProductCategory,
  type ProductContentByLocale,
  type ProductContentInputByLocale,
  type ProductImage,
  type ProductImageInput,
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
  category: ProductCategory;
  specifications: ProductSpecifications;
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
const productStatusSet: ReadonlySet<string> = new Set(productStatuses);

export class Product {
  readonly id: ProductId;
  readonly sku: ProductSku;
  readonly slug: ProductSlug;
  readonly category: ProductCategory;

  private readonly productSpecifications: ProductSpecifications;
  private readonly productImages: readonly ProductImage[];
  private readonly localizedContent: ProductContentByLocale;
  private readonly createdTimestamp: Date;
  private currentStatus: ProductStatus;
  private currentUpdatedAt: Date;

  private constructor(input: ReconstituteProductInput) {
    this.id = ProductId.create(input.id);
    this.sku = ProductSku.create(input.sku);
    this.slug = ProductSlug.create(input.slug);
    this.category = input.category;
    this.currentStatus = input.status;
    this.productSpecifications = freezeSpecifications(input.specifications);
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
    validateCategory(input.category);
    validateStatus(input.status);
    validateTimestamps(input.createdAt, input.updatedAt);
    validateSpecifications(input.specifications);
    validateImages(input.images);
    validateLocalizedContent(input.content);

    if (input.status === "published") {
      validatePublication(input.content, input.images);
    }

    return new Product(input);
  }

  get status(): ProductStatus {
    return this.currentStatus;
  }

  get specifications(): ProductSpecifications {
    return this.productSpecifications;
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
      validatePublication(this.localizedContent, this.productImages);
    }

    this.currentStatus = status;
    this.currentUpdatedAt = new Date(updatedAt);
  }
}

function validateCategory(category: string): asserts category is ProductCategory {
  if (!productCategorySet.has(category)) {
    throw new InvalidProductCategoryError();
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

  for (const key of ["glassColor", "neckFinish"] as const) {
    const value = specifications[key];

    if (value !== undefined && value.trim().length === 0) {
      throw new InvalidTechnicalSpecificationError(key);
    }
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
  content: ProductContentInputByLocale | ProductContentByLocale,
  images: readonly ProductImageInput[] | readonly ProductImage[],
): void {
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
