export class InquiryMappingError extends Error { readonly name = "InquiryMappingError"; constructor(message: string, readonly cause?: unknown) { super(message); } }
