import {randomBytes, scrypt as nodeScrypt, timingSafeEqual} from "node:crypto";

import type {PasswordHasher} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

const algorithm = "yolpol-scrypt";
const version = "v=1";
const logN = 17;
const cost = 2 ** logN;
const blockSize = 8;
const parallelization = 1;
const saltLength = 16;
const keyLength = 32;
const maxMemory = 256 * 1024 * 1024;
const saltPattern = /^[A-Za-z0-9_-]{22}$/u;
const hashPattern = /^[A-Za-z0-9_-]{43}$/u;

export const staffAuthenticationDummyPasswordHash = "$yolpol-scrypt$v=1$ln=17,r=8,p=1$eW9scG9sLXN0YWZmLWR1bQ$bdLNpYdn4w08WTMZ0RkwpcmiqmJ4RcrFwhhMXFozYSc";

type ParsedHash = Readonly<{salt: Buffer; derivedKey: Buffer}>;

function decodeBase64Url(value: string, pattern: RegExp, bytes: number): Buffer | null {
  if (!pattern.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.length !== bytes || decoded.toString("base64url") !== value) return null;
  return decoded;
}

function parseStoredHash(storedHash: string): ParsedHash | null {
  if (typeof storedHash !== "string") return null;
  const parts = storedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "" || parts[1] !== algorithm || parts[2] !== version || parts[3] !== `ln=${logN},r=${blockSize},p=${parallelization}`) return null;
  const salt = decodeBase64Url(parts[4] ?? "", saltPattern, saltLength);
  const derivedKey = decodeBase64Url(parts[5] ?? "", hashPattern, keyLength);
  return salt && derivedKey ? {salt, derivedKey} : null;
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, keyLength, {N: cost, r: blockSize, p: parallelization, maxmem: maxMemory}, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export class NodeScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    if (typeof password !== "string" || password.length < 1 || password.length > 1_024) throw new Error("Password input is invalid.");
    const salt = randomBytes(saltLength);
    const derivedKey = await derive(password, salt);
    return `$${algorithm}$${version}$ln=${logN},r=${blockSize},p=${parallelization}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    if (typeof password !== "string" || password.length > 1_024) return false;
    const parsed = parseStoredHash(storedHash);
    if (!parsed) return false;
    try {
      const actual = await derive(password, parsed.salt);
      return actual.length === parsed.derivedKey.length && timingSafeEqual(actual, parsed.derivedKey);
    } catch {
      return false;
    }
  }
}
