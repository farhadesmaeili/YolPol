declare const indexNowKeyBrand: unique symbol;

export type IndexNowKey = string & {readonly [indexNowKeyBrand]: true};

export class InvalidIndexNowKeyError extends Error {
  readonly name = "InvalidIndexNowKeyError";

  constructor() {
    super("Invalid IndexNow key.");
  }
}

export function parseIndexNowKey(value: string): IndexNowKey {
  if (!/^[A-Za-z0-9-]{8,128}$/u.test(value)) throw new InvalidIndexNowKeyError();
  return value as IndexNowKey;
}
