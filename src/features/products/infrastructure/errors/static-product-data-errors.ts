export abstract class StaticProductDataIntegrityError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DuplicateStaticProductIdError extends StaticProductDataIntegrityError {
  constructor(id: string) {
    super(`Static product data contains duplicate product ID "${id}".`);
  }
}

export class DuplicateStaticProductSkuError extends StaticProductDataIntegrityError {
  constructor(sku: string) {
    super(`Static product data contains duplicate SKU "${sku}".`);
  }
}

export class DuplicateStaticProductSlugError extends StaticProductDataIntegrityError {
  constructor(slug: string) {
    super(`Static product data contains duplicate global slug "${slug}".`);
  }
}

export class DuplicateStaticLocalizedRecordError extends StaticProductDataIntegrityError {
  constructor(productId: string, locale: string) {
    super(`Static product data contains duplicate locale "${locale}" for product "${productId}".`);
  }
}

export class OrphanStaticLocalizedRecordError extends StaticProductDataIntegrityError {
  constructor(productId: string) {
    super(`Localized product data references missing product "${productId}".`);
  }
}

export class MissingStaticLocalizedContentError extends StaticProductDataIntegrityError {
  constructor(productId: string) {
    super(`Technical product "${productId}" has no localized content.`);
  }
}
