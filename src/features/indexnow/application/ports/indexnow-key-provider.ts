import type {IndexNowKey} from "@/features/indexnow/domain/value-objects/indexnow-key";

export interface IndexNowKeyProvider {
  readKey(): Promise<IndexNowKey>;
}
