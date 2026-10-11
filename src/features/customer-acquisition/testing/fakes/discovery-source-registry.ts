import type {DiscoverySourceRegistry} from "@/features/customer-acquisition/application/ports/discovery-source-registry";
import {fixturePolicy} from "@/features/customer-acquisition/testing/fixtures/discovery-fixtures";
export const fixtureRegistry: DiscoverySourceRegistry = {find: (key, version) => key === fixturePolicy.key && version === fixturePolicy.version ? fixturePolicy : undefined};
