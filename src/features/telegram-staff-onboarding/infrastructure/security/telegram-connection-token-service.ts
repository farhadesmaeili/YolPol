import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";

import type {IssuedTelegramConnectionToken, PresentedTelegramConnectionToken, TelegramConnectionTokenService, TelegramStaffOnboardingIdGenerator} from "@/features/telegram-staff-onboarding/application/ports/telegram-staff-onboarding-ports";

const credentialPattern = /^ypt_([A-Za-z0-9_-]{43})$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function digest(purpose: "lookup" | "verification", credential: string): string {
  return createHash("sha256").update(`yolpol:telegram-staff-connection:v1:${purpose}:${credential}`, "utf8").digest("hex");
}

export class NodeTelegramConnectionTokenService implements TelegramConnectionTokenService {
  constructor(
    private readonly secureRandomBytes: (size: number) => Buffer = randomBytes,
    private readonly randomId: () => string = randomUUID,
  ) {}

  issue(): IssuedTelegramConnectionToken {
    const credential = `ypt_${this.secureRandomBytes(32).toString("base64url")}`;
    const requestId = `telegram_request_${this.randomId().replaceAll("-", "")}`;
    if (!credentialPattern.test(credential) || !/^[A-Za-z0-9_-]{1,128}$/u.test(requestId)) {
      throw new Error("Telegram connection token generation failed.");
    }
    return Object.freeze({
      requestId,
      credential,
      lookup: digest("lookup", credential),
      verification: digest("verification", credential),
    });
  }

  inspect(credential: string): PresentedTelegramConnectionToken | null {
    if (!credentialPattern.test(credential)) return null;
    return Object.freeze({lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  digestsMatch(actual: string, expected: string): boolean {
    if (!digestPattern.test(actual) || !digestPattern.test(expected)) return false;
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }
}

export class NodeTelegramStaffOnboardingIdGenerator implements TelegramStaffOnboardingIdGenerator {
  constructor(private readonly randomId: () => string = randomUUID) {}

  linkId(): string {
    const id = `telegram_link_${this.randomId().replaceAll("-", "")}`;
    if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) throw new Error("Telegram link ID generation failed.");
    return id;
  }
}
