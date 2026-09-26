export type IndexNowFailureCode =
  | "invalid_environment"
  | "empty_url_set"
  | "invalid_url"
  | "bad_request"
  | "forbidden"
  | "unprocessable_urls"
  | "rate_limited"
  | "provider_failure"
  | "timeout"
  | "network_failure"
  | "unexpected_response";

export class IndexNowSubmissionError extends Error {
  readonly name = "IndexNowSubmissionError";

  constructor(readonly code: IndexNowFailureCode) {
    super(`IndexNow submission failed: ${code}.`);
  }
}
