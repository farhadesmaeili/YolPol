export abstract class ProductDomainError extends Error {
  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidProductIdError extends ProductDomainError {
  constructor() {
    super("Product ID must contain 1 to 64 URL-safe characters.");
  }
}

export class InvalidProductSkuError extends ProductDomainError {
  constructor() {
    super("Product SKU must contain 2 to 64 letters, numbers, hyphens, or underscores.");
  }
}

export class InvalidProductSlugError extends ProductDomainError {
  constructor() {
    super("Product slug must be a lowercase URL-safe slug of at most 120 characters.");
  }
}

export class InvalidProductNameError extends ProductDomainError {
  constructor() {
    super("Product name must contain 2 to 120 non-whitespace characters.");
  }
}

export class InvalidProductCategoryError extends ProductDomainError {
  constructor(reason = "category is not supported") {
    super(`Invalid Product categories: ${reason}.`);
  }
}

export class InvalidProductStatusError extends ProductDomainError {
  constructor() {
    super("Product status is not supported.");
  }
}

export class InvalidTechnicalSpecificationError extends ProductDomainError {
  constructor(field: string) {
    super(`Product specification "${field}" has an invalid value.`);
  }
}

export class InvalidProductPackagingError extends ProductDomainError {
  constructor(field: string) {
    super(`Product packaging field "${field}" has an invalid value.`);
  }
}

export class InvalidProductPricingError extends ProductDomainError {
  constructor() {
    super("Product pricing mode is not supported.");
  }
}

export class InvalidProductImageError extends ProductDomainError {
  constructor(reason: string) {
    super(`Invalid product image: ${reason}`);
  }
}

export class InvalidLocalizedContentError extends ProductDomainError {
  constructor(reason: string) {
    super(`Invalid localized product content: ${reason}`);
  }
}

export class InvalidProductTimestampError extends ProductDomainError {
  constructor() {
    super("Product timestamps must be valid and updatedAt cannot move backwards.");
  }
}

export class InvalidProductStatusTransitionError extends ProductDomainError {
  constructor(from: string, to: string) {
    super(`Product status cannot transition from "${from}" to "${to}".`);
  }
}

export class ProductPublicationError extends ProductDomainError {
  constructor(reason: string) {
    super(`Product cannot be published: ${reason}`);
  }
}
