const productIdentifierPattern = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{0,62}[A-Za-z0-9])?$/u;

export function isProductIdentifier(value: unknown): value is string {
  return typeof value === "string" && productIdentifierPattern.test(value);
}
