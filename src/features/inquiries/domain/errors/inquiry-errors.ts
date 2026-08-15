export class InquiryValidationError extends Error { readonly name = "InquiryValidationError"; constructor(readonly field: string, message: string) { super(message); } }
export class InquiryTransitionError extends Error { readonly name = "InquiryTransitionError"; }
