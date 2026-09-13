import {createHash, randomBytes, randomUUID, timingSafeEqual} from "node:crypto";

import type {IssuedStaffInvitationToken, PresentedStaffInvitationToken, StaffInvitationTokenService} from "@/features/staff-authentication/application/ports/staff-management-ports";

const credentialPattern = /^ypi_([A-Za-z0-9_-]{43})$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

function digest(purpose: "lookup" | "verification", credential: string): string {
  return createHash("sha256").update(`yolpol:staff-invitation:v1:${purpose}:${credential}`, "utf8").digest("hex");
}

export class NodeStaffInvitationTokenService implements StaffInvitationTokenService {
  constructor(
    private readonly secureRandomBytes: (size: number) => Buffer = randomBytes,
    private readonly randomId: () => string = randomUUID,
  ) {}

  issue(): IssuedStaffInvitationToken {
    const credential = `ypi_${this.secureRandomBytes(32).toString("base64url")}`;
    const invitationId = `staff_invitation_${this.randomId().replaceAll("-", "")}`;
    if (!credentialPattern.test(credential) || !/^[A-Za-z0-9_-]{1,128}$/u.test(invitationId)) throw new Error("Staff invitation token generation failed.");
    return Object.freeze({invitationId, credential, lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  inspect(credential: string): PresentedStaffInvitationToken | null {
    if (!credentialPattern.test(credential)) return null;
    return Object.freeze({lookup: digest("lookup", credential), verification: digest("verification", credential)});
  }

  digestsMatch(actual: string, expected: string): boolean {
    if (!digestPattern.test(actual) || !digestPattern.test(expected)) return false;
    return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
  }
}
