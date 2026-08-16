import type {InquiryUnit, PreferredContactMethod} from "@/features/inquiries/domain/types/inquiry-types";

export type InquiryProductOption = Readonly<{id: string; sku: string; name: string}>;
export type InquiryDraftLine = Readonly<{productId: string; quantityText: string; unit: InquiryUnit | ""}>;
export type InquiryDraftErrorCode = "required" | "invalid" | "tooLarge" | "destinationDependency";
export type InquiryDraftFailure = Readonly<{field: "fullName" | "company" | "country" | "city" | "email" | "phone" | "preferredContact" | "destinationCountry" | "destinationCity" | "message" | "privacy" | "products" | "quantity" | "unit"; code: InquiryDraftErrorCode; itemIndex?: number; productId?: string}>;
export type InquiryFormLabels = Readonly<{
  customer: string; fullName: string; company: string; country: string; city: string; email: string; phone: string;
  preferredContact: string; contactMethods: Readonly<Record<PreferredContactMethod, string>>;
  products: string; product: string; requestedQuantityRequired: string; unitRequired: string; selectUnit: string; units: Readonly<Record<InquiryUnit, string>>; removeProduct: string;
  productSelection: Readonly<{emptyTitle: string; emptyDescription: string; selectProduct: string; productPlaceholder: string; addProduct: string; addAnotherProduct: string; allProductsAdded: string}>;
  destination: string; destinationCountry: string; destinationCity: string; message: string;
  privacyPrefix: string; privacyLink: string; privacySuffix: string;
  review: string; prepared: string; invalid: string; submissionUnavailable: string; emailAction: string; whatsappAction: string;
  errors: Readonly<{invalidField: string; quantityRequired: string; quantityInvalid: string; quantityTooLarge: string; unitRequired: string; productsRequired: string; privacyRequired: string; destinationDependency: string}>;
}>;
