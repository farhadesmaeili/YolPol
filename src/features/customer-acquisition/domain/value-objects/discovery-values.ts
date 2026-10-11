import {DiscoveryError} from "@/features/customer-acquisition/domain/types/discovery-types";
export function discoveryUuid(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/u.test(value)) throw new DiscoveryError("INVALID_REQUEST");
  return value;
}
export function discoveryVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 2147483646) throw new DiscoveryError("INVALID_REQUEST");
  return value;
}
