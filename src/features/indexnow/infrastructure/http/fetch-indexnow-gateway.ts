import {IndexNowSubmissionError} from "@/features/indexnow/application/errors/indexnow-submission-error";
import type {
  IndexNowGateway,
  IndexNowGatewayRequest,
  IndexNowReceipt,
} from "@/features/indexnow/application/ports/indexnow-gateway";

export const indexNowEndpoint = "https://api.indexnow.org/indexnow";
export const defaultIndexNowTimeoutMilliseconds = 10_000;

type FetchResponse = Readonly<{status: number}>;
type FetchClient = (
  input: string,
  init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
    signal: AbortSignal;
    redirect: "error";
  }>,
) => Promise<FetchResponse>;

export class FetchIndexNowGateway implements IndexNowGateway {
  constructor(
    private readonly fetchClient: FetchClient = fetch,
    private readonly timeoutMilliseconds = defaultIndexNowTimeoutMilliseconds,
  ) {}

  async submit(request: IndexNowGatewayRequest): Promise<IndexNowReceipt> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);

    try {
      const response = await this.fetchClient(indexNowEndpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json; charset=utf-8"},
        body: JSON.stringify(request),
        signal: controller.signal,
        redirect: "error",
      });
      if (response.status === 200) return "submitted";
      if (response.status === 202) return "accepted_pending_key_validation";
      if (response.status === 400) throw new IndexNowSubmissionError("bad_request");
      if (response.status === 403) throw new IndexNowSubmissionError("forbidden");
      if (response.status === 422) throw new IndexNowSubmissionError("unprocessable_urls");
      if (response.status === 429) throw new IndexNowSubmissionError("rate_limited");
      if (response.status >= 500 && response.status <= 599) {
        throw new IndexNowSubmissionError("provider_failure");
      }
      throw new IndexNowSubmissionError("unexpected_response");
    } catch (error) {
      if (error instanceof IndexNowSubmissionError) throw error;
      throw new IndexNowSubmissionError(controller.signal.aborted ? "timeout" : "network_failure");
    } finally {
      clearTimeout(timeout);
    }
  }
}
