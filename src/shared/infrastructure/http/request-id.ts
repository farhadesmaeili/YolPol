export const requestIdHeader = "x-request-id";
export const maximumRequestIdLength = 64;

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u;

export function isSafeRequestId(value: string | null | undefined): value is string {
  return value !== null
    && value !== undefined
    && value.length <= maximumRequestIdLength
    && requestIdPattern.test(value);
}

export function resolveRequestId(
  incoming: string | null | undefined,
  generate: () => string = () => crypto.randomUUID(),
): string {
  return isSafeRequestId(incoming) ? incoming : generate();
}
