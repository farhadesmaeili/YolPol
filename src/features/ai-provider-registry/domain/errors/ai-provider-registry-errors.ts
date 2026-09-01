export class AiProviderRegistryValidationError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = "AiProviderRegistryValidationError";
  }
}
