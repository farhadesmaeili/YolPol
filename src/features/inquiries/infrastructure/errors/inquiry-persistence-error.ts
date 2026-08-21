export class InquiryPersistenceError extends Error {
  readonly name = "InquiryPersistenceError";
  constructor() { super("Inquiry persistence failed."); }
}
