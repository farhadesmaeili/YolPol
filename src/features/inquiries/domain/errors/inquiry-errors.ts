export class InquiryValidationError extends Error { readonly name = "InquiryValidationError"; constructor(readonly field: string, message: string) { super(message); } }
export class InquiryTransitionError extends Error { readonly name = "InquiryTransitionError"; }
export class InquiryAssignmentError extends Error { readonly name = "InquiryAssignmentError"; }
