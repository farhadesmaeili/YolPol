declare const indexNowUrlBrand: unique symbol;

export type IndexNowUrl = string & {readonly [indexNowUrlBrand]: true};

export class InvalidIndexNowUrlError extends Error {
  readonly name = "InvalidIndexNowUrlError";

  constructor() {
    super("Invalid canonical IndexNow URL.");
  }
}

export function parseCanonicalIndexNowUrl(value: string, canonicalOrigin: string): IndexNowUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidIndexNowUrlError();
  }

  if (
    url.protocol !== "https:"
    || url.origin !== canonicalOrigin
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
    || url.toString() !== value
  ) {
    throw new InvalidIndexNowUrlError();
  }

  return value as IndexNowUrl;
}
