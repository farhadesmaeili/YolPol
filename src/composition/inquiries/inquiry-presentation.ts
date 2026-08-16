import {listPublishedProductDtos} from "@/composition/products/product-catalog";
import type {InquiryProductOption} from "@/features/inquiries/presentation/view-models/inquiry-form-view-model";
import type {Locale} from "@/shared/types/locale";

export async function listInquiryProductOptions(locale: Locale): Promise<readonly InquiryProductOption[]> {
  const products = await listPublishedProductDtos(locale);
  return Object.freeze(products.map(({id, sku, name}) => Object.freeze({id, sku, name})));
}
