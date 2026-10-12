import "server-only";

import {ListStaffDiscoveryCandidates} from "@/features/customer-acquisition/application/use-cases/list-staff-discovery-candidates";
import {UnconfiguredStaffDiscoveryReader} from "@/features/customer-acquisition/infrastructure/readers/unconfigured-staff-discovery-reader";
import {StaffAuthorizationPolicy} from "@/features/staff-authentication/application/policies/staff-authorization-policy";

export function getStaffDiscoveryCandidates() {
  return new ListStaffDiscoveryCandidates(new UnconfiguredStaffDiscoveryReader(), new StaffAuthorizationPolicy());
}
