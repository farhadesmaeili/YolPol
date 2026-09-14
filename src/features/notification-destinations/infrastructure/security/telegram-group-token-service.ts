import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";

import type {IssuedTelegramGroupToken, NotificationDestinationIdGenerator, PresentedTelegramGroupToken, TelegramGroupTokenService} from "@/features/notification-destinations/application/ports/notification-destination-ports";

const credentialPattern = /^ypg_([A-Za-z0-9_-]{43})$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function digest(purpose: "lookup" | "verification", credential: string): string {
  return createHash("sha256").update(`yolpol:telegram-group-connection:v1:${purpose}:${credential}`, "utf8").digest("hex");
}

export class NodeTelegramGroupTokenService implements TelegramGroupTokenService {
  constructor(private readonly secureRandomBytes: (size: number) => Buffer = randomBytes, private readonly randomId: () => string = randomUUID) {}

  issue(): IssuedTelegramGroupToken {
    const credential = `ypg_${this.secureRandomBytes(32).toString("base64url")}`;
    const requestId = `telegram_group_request_${this.randomId().replaceAll("-", "")}`;
    if (!credentialPattern.test(credential) || !/^[A-Za-z0-9_-]{1,128}$/u.test(requestId)) throw new Error("Telegram group token generation failed.");
    return Object.freeze({requestId, credential, lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  inspect(credential: string): PresentedTelegramGroupToken | null {
    return credentialPattern.test(credential) ? Object.freeze({lookup: digest("lookup", credential), verification: digest("verification", credential)}) : null;
  }

  digestsMatch(actual: string, expected: string): boolean {
    return digestPattern.test(actual) && digestPattern.test(expected)
      ? timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))
      : false;
  }
}

export class NodeNotificationDestinationIdGenerator implements NotificationDestinationIdGenerator {
  constructor(private readonly randomId: () => string = randomUUID) {}
  recipientId(): string { return `notification_recipient_${this.randomId().replaceAll("-", "")}`; }
  eventId(): string { return `notification_event_${this.randomId().replaceAll("-", "")}`; }
}
