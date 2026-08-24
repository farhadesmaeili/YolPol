import "server-only";

import {randomUUID} from "node:crypto";

import {findProductDtoById} from "@/composition/products/product-catalog";
import {getInquiryRepository} from "@/composition/inquiries/inquiry-persistence";
import type {InquiryProductCatalog, InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import {SubmitInquiry} from "@/features/inquiries/application/use-cases/submit-inquiry";
import {supportedLocales} from "@/shared/types/locale";

export const inquiryProductCatalog: InquiryProductCatalog = {
  async findById(id) {
    const localized = await Promise.all(supportedLocales.map(async (locale) => ({locale, result: await findProductDtoById(id, locale)})));
    const found = localized.find(({result}) => result.status === "found");
    if (!found || found.result.status !== "found") return null;
    return {
      id: found.result.product.id,
      sku: found.result.product.sku,
      slug: found.result.product.slug,
      status: found.result.product.status,
      localizedNames: Object.fromEntries(localized.flatMap(({locale, result}) => result.status === "found" ? [[locale, result.product.name]] : [])),
      packaging: found.result.product.packaging ? {unitsPerPallet: found.result.product.packaging.unitsPerPallet, grossPalletWeightGrams: found.result.product.packaging.palletGrossWeightKg * 1_000} : undefined,
    };
  },
};

export function getInquirySubmission(): SubmitInquiry {
  return createInquirySubmission(getInquiryRepository());
}

export function createInquirySubmission(repository: InquiryRepository): SubmitInquiry {
  return new SubmitInquiry(repository, inquiryProductCatalog, {generate: () => randomUUID()}, {now: () => new Date()});
}
