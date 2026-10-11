import {createHash, timingSafeEqual} from "node:crypto";
import {readFileSync, statSync} from "node:fs";
import type {DiscoveryPrincipal} from "@/features/customer-acquisition/domain/types/discovery-types";
import {discoveryUuid} from "@/features/customer-acquisition/domain/value-objects/discovery-values";
import {discoveryObject} from "@/features/customer-acquisition/infrastructure/validation/discovery-input";

export type DiscoveryAuthenticator = (authorization: string | null) => DiscoveryPrincipal | null;
export function loadDiscoveryAuthentication(path: string | undefined, existingToken: string): DiscoveryAuthenticator {
  if (!path) return () => null;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 2048 || (process.platform !== "win32" && (stat.mode & 0o077) !== 0)) throw new Error();
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    const config = discoveryObject(parsed, ["intake", "reviewer"]);
    const binding = (value: unknown, capability: DiscoveryPrincipal["capability"]) => {
      const item = discoveryObject(value, ["principalId", "token"]);
      const id = discoveryUuid(item.principalId);
      if (typeof item.token !== "string" || !/^[a-f0-9]{64}$/u.test(item.token) || item.token === existingToken) throw new Error();
      return {principal: Object.freeze({id, capability}), token: item.token, hash: createHash("sha256").update(`Bearer ${item.token}`).digest()};
    };
    const intake = binding(config.intake, "INTAKE"); const reviewer = binding(config.reviewer, "REVIEW");
    if (intake.token === reviewer.token || intake.principal.id === reviewer.principal.id) throw new Error();
    return authorization => {
      if (!authorization || authorization.length > 128) return null;
      const hash = createHash("sha256").update(authorization).digest();
      const isIntake = timingSafeEqual(hash, intake.hash); const isReviewer = timingSafeEqual(hash, reviewer.hash);
      return isIntake ? intake.principal : isReviewer ? reviewer.principal : null;
    };
  } catch { throw new Error("Discovery authentication configuration rejected."); }
}
