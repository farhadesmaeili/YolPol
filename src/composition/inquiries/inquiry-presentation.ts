import {listPublishedProductDtos} from "@/composition/products/product-catalog";
import type {InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import type {Locale} from "@/shared/types/locale";

type InquiryPackaging = Readonly<{unitsPerPackage: number; packagesPerPallet: number; unitsPerPallet: number}>;

export function inquiryAvailableUnits(locale: Locale, packaging: InquiryPackaging | undefined): InquiryProductOption["availableUnits"] {
  const validPackageData = packaging !== undefined
    && Number.isSafeInteger(packaging.unitsPerPackage) && packaging.unitsPerPackage > 0
    && Number.isSafeInteger(packaging.packagesPerPallet) && packaging.packagesPerPallet > 0
    && Number.isSafeInteger(packaging.unitsPerPallet) && packaging.unitsPerPallet > 0
    && packaging.unitsPerPackage * packaging.packagesPerPallet === packaging.unitsPerPallet;
  return locale === "fa" && validPackageData ? Object.freeze(["pallets", "packages"] as const) : Object.freeze(["pallets"] as const);
}

export async function listInquiryProductOptions(locale: Locale): Promise<readonly InquiryProductOption[]> {
  const products = await listPublishedProductDtos(locale);
  return Object.freeze(products.map(({id, sku, name, packaging}) => {
    const availableUnits = inquiryAvailableUnits(locale, packaging);
    return Object.freeze({id, sku, name, availableUnits});
  }));
}
