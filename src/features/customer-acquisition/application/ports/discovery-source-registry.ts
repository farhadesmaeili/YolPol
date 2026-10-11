import type {DiscoveryPolicy} from "@/features/customer-acquisition/domain/types/discovery-types";
export interface DiscoverySourceRegistry { find(key: string, version: string): DiscoveryPolicy | undefined }
