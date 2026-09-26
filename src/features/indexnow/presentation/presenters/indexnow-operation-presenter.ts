import type {IndexNowFailureCode} from "@/features/indexnow/application/errors/indexnow-submission-error";
import type {SubmitIndexNowResult} from "@/features/indexnow/application/use-cases/submit-indexnow";

export function presentIndexNowSuccess(result: SubmitIndexNowResult): string {
  return JSON.stringify({
    event: "indexnow.submission.completed",
    result: result.receipt,
    submittedUrlCount: result.submittedUrlCount,
    batchCount: result.batchCount,
  });
}

export function presentIndexNowFailure(code: IndexNowFailureCode | "configuration_failure"): string {
  return JSON.stringify({
    event: "indexnow.submission.failed",
    result: "failed",
    reason: code,
  });
}
