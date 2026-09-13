import type {CatalogProduct} from "@/features/export-logistics/application/ports/logistics-product-catalog";
import type {PackagingSnapshot} from "@/features/export-logistics/domain/types/load-plan";
import {isProductIdentifier} from "@/features/export-logistics/domain/validation/product-identifier";
import {isSupportedLocale, type Locale} from "@/shared/types/locale";

type TrustedCatalogProduct = Readonly<{
  id: string;
  sku: string;
  name: string;
  status: "published";
  locale: Locale;
  packaging?: PackagingSnapshot;
}>;

export type CatalogProductValidation =
  | Readonly<{status: "valid"; product: TrustedCatalogProduct}>
  | Readonly<{status: "unpublished"}>
  | Readonly<{status: "locale_unavailable"}>
  | Readonly<{status: "malformed"}>;

const safeText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.trim() === value &&
  value.length > 0 &&
  !/[\u0000-\u001f\u007f]/u.test(value);

const positiveSafeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const productSkuPattern = /^[A-Z0-9][A-Z0-9_-]{1,63}$/u;

export function validateCatalogProduct(
  value: unknown,
  requestedLocale: Locale,
  requestedId?: string,
): CatalogProductValidation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {status: "malformed"};
  const product = value as CatalogProduct;
  if (!safeText(product.id) || !safeText(product.sku) || !safeText(product.name)) return {status: "malformed"};
  const id = product.id as string;
  const sku = product.sku as string;
  const name = product.name as string;
  if (!isProductIdentifier(id) || !productSkuPattern.test(sku)) return {status: "malformed"};
  if (requestedId !== undefined && id !== requestedId) return {status: "malformed"};
  if (product.status === "draft" || product.status === "archived") return {status: "unpublished"};
  if (product.status !== "published") return {status: "malformed"};
  if (typeof product.locale !== "string" || !isSupportedLocale(product.locale)) return {status: "malformed"};
  if (product.locale !== requestedLocale) return {status: "locale_unavailable"};

  const packaging = validatePackaging({id, sku, name}, product.packaging);
  if (packaging === "malformed") return {status: "malformed"};
  return Object.freeze({
    status: "valid",
    product: Object.freeze({
      id,
      sku,
      name,
      status: "published",
      locale: product.locale,
      packaging,
    }),
  });
}

function validatePackaging(
  product: Readonly<{id: string; sku: string; name: string}>,
  value: unknown,
): PackagingSnapshot | undefined | "malformed" {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "malformed";
  const packaging = value as Record<string, unknown>;
  const {unitsPerPackage, packagesPerPallet, unitsPerPallet, palletGrossWeightKg} = packaging;
  if (![unitsPerPackage, packagesPerPallet, unitsPerPallet, palletGrossWeightKg].every(positiveSafeInteger)) return "malformed";
  const grams = (palletGrossWeightKg as number) * 1000;
  const derivedUnits = (unitsPerPackage as number) * (packagesPerPallet as number);
  if (!Number.isSafeInteger(grams) || !Number.isSafeInteger(derivedUnits) || derivedUnits !== unitsPerPallet) return "malformed";
  return Object.freeze({
    productId: product.id,
    sku: product.sku,
    productName: product.name,
    unitsPerPackage: unitsPerPackage as number,
    packagesPerPallet: packagesPerPallet as number,
    unitsPerPallet: unitsPerPallet as number,
    grossPalletWeightGrams: grams,
  });
}
