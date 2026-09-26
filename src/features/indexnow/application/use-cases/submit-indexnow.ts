import {IndexNowSubmissionError} from "@/features/indexnow/application/errors/indexnow-submission-error";
import type {IndexableUrlSource} from "@/features/indexnow/application/ports/indexable-url-source";
import type {
  IndexNowGateway,
  IndexNowReceipt,
} from "@/features/indexnow/application/ports/indexnow-gateway";
import type {IndexNowKeyProvider} from "@/features/indexnow/application/ports/indexnow-key-provider";
import {
  InvalidIndexNowUrlError,
  parseCanonicalIndexNowUrl,
  type IndexNowUrl,
} from "@/features/indexnow/domain/value-objects/indexnow-url";

export const indexNowMaximumUrlsPerRequest = 10_000;

export type SubmitIndexNowResult = Readonly<{
  receipt: IndexNowReceipt;
  submittedUrlCount: number;
  batchCount: number;
}>;

export class SubmitIndexNow {
  constructor(
    private readonly urlSource: IndexableUrlSource,
    private readonly keyProvider: IndexNowKeyProvider,
    private readonly gateway: IndexNowGateway,
    private readonly canonicalOrigin: string,
    private readonly keyLocation: string,
  ) {}

  async execute(deploymentEnvironment: string): Promise<SubmitIndexNowResult> {
    if (deploymentEnvironment !== "production") {
      throw new IndexNowSubmissionError("invalid_environment");
    }

    const urls = await this.resolveUrls();
    if (urls.length === 0) throw new IndexNowSubmissionError("empty_url_set");
    const key = await this.keyProvider.readKey();
    const receipts: IndexNowReceipt[] = [];

    for (let offset = 0; offset < urls.length; offset += indexNowMaximumUrlsPerRequest) {
      receipts.push(await this.gateway.submit({
        host: new URL(this.canonicalOrigin).host,
        key,
        keyLocation: this.keyLocation,
        urlList: urls.slice(offset, offset + indexNowMaximumUrlsPerRequest),
      }));
    }

    return Object.freeze({
      receipt: receipts.includes("accepted_pending_key_validation")
        ? "accepted_pending_key_validation"
        : "submitted",
      submittedUrlCount: urls.length,
      batchCount: receipts.length,
    });
  }

  private async resolveUrls(): Promise<readonly IndexNowUrl[]> {
    try {
      return [...new Set(await this.urlSource.listIndexableUrls())]
        .sort((left, right) => left.localeCompare(right))
        .map((url) => parseCanonicalIndexNowUrl(url, this.canonicalOrigin));
    } catch (error) {
      if (error instanceof InvalidIndexNowUrlError) {
        throw new IndexNowSubmissionError("invalid_url");
      }
      throw error;
    }
  }
}
