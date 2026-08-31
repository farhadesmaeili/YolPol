import type {PreferredContactMethod, TargetCountryCode} from "@/features/inquiries/domain/types/inquiry-types";
import type {SubmitInquiryUnit} from "@/features/inquiries/application/dto/inquiry-dto";

export type InquiryProductOption = Readonly<{id: string; sku: string; name: string; availableUnits: readonly SubmitInquiryUnit[]}>;
export type InquiryDraftLine = Readonly<{productId: string; quantityText: string; unit: SubmitInquiryUnit}>;
export type InquiryDraftErrorCode = "required" | "invalid" | "tooLarge" | "destinationDependency";
export type InquiryDraftFailure = Readonly<{field: "fullName" | "company" | "country" | "city" | "email" | "phone" | "whatsappPhone" | "telegramUsername" | "preferredContact" | "destinationCountry" | "destinationCity" | "message" | "privacy" | "products" | "quantity" | "quantityUnit"; code: InquiryDraftErrorCode; itemIndex?: number; productId?: string}>;
export type InquiryFormLabels = Readonly<{
  customer: string; fullName: string; company: string; country: string; city: string; email: string; phone: string;
  preferredContact: string; whatsappPhone: string; telegramUsername: string; contactMethods: Readonly<Record<PreferredContactMethod, string>>;
  countries: Readonly<Record<TargetCountryCode, string>>; countryPlaceholder: string;
  products: string; product: string; palletCountRequired: string; quantityRequired: string; quantityUnit: string; units: Readonly<Record<SubmitInquiryUnit, string>>; removeProduct: string;
  productSelection: Readonly<{emptyTitle: string; emptyDescription: string; selectProduct: string; productPlaceholder: string; addProduct: string; addAnotherProduct: string; allProductsAdded: string}>;
  destination: string; destinationCountry: string; destinationCity: string; message: string;
  privacyLink: string; privacyAgreement: string;
  submit: string; submitting: string; succeeded: string; reference: string; invalid: string; productUnavailable: string; serviceFailure: string; retry: string; rateLimited: string; timeout: string;
  errors: Readonly<{invalidField: string; phoneInvalid: string; whatsappPhoneInvalid: string; telegramUsernameInvalid: string; preferredContactRequired: string; quantityRequired: string; quantityInvalid: string; quantityTooLarge: string; quantityUnitInvalid: string; productsRequired: string; privacyRequired: string; destinationDependency: string}>;
}>;
