import {createHash, randomBytes, timingSafeEqual} from "node:crypto";

import type {IssuedStaffSessionToken, PresentedStaffSessionToken, StaffSessionTokenService} from "@/features/staff-authentication/application/ports/staff-authentication-ports";

const credentialPattern = /^yps_([A-Za-z0-9_-]{43})$/u;
const digestPattern = /^[a-f0-9]{64}$/u;
type SecureRandomBytes = (size: number) => Buffer;

function digest(purpose: "lookup" | "verification", credential: string): string {
  return createHash("sha256").update(`yolpol:staff-session:v1:${purpose}:${credential}`, "utf8").digest("hex");
}

export class NodeStaffSessionTokenService implements StaffSessionTokenService {
  constructor(private readonly secureRandomBytes: SecureRandomBytes = randomBytes) {}

  issue(): IssuedStaffSessionToken {
    const secret = this.secureRandomBytes(32).toString("base64url");
    const sessionReference = this.secureRandomBytes(16).toString("base64url");
    const credential = `yps_${secret}`;
    const sessionId = `staff_session_${sessionReference}`;
    if (!credentialPattern.test(credential) || !/^[A-Za-z0-9_-]{1,128}$/u.test(sessionId)) throw new Error("Staff session token generation failed.");
    return Object.freeze({sessionId, credential, lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  inspect(credential: string): PresentedStaffSessionToken | null {
    if (!credentialPattern.test(credential)) return null;
    return Object.freeze({lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  digestsMatch(actual: string, expected: string): boolean {
    if (!digestPattern.test(actual) || !digestPattern.test(expected)) return false;
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }
}
