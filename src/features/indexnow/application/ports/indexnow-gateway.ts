import type {IndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";
import type {IndexNowUrl} from "@/features/indexnow/domain/value-objects/indexnow-url";

export type IndexNowReceipt = "submitted" | "accepted_pending_key_validation";

export type IndexNowGatewayRequest = Readonly<{
  host: string;
  key: IndexNowKey;
  keyLocation: string;
  urlList: readonly IndexNowUrl[];
}>;

export interface IndexNowGateway {
  submit(request: IndexNowGatewayRequest): Promise<IndexNowReceipt>;
}
