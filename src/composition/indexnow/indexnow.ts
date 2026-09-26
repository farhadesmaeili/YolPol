import {listCanonicalIndexableUrls} from "@/composition/seo/public-indexable-pages";
import {IndexNowSubmissionError} from "@/features/indexnow/application/errors/indexnow-submission-error";
import {SubmitIndexNow} from "@/features/indexnow/application/use-cases/submit-indexnow";
import {
  FileIndexNowKeyProvider,
  InvalidIndexNowKeyConfigurationError,
} from "@/features/indexnow/infrastructure/config/file-indexnow-key-provider";
import {FetchIndexNowGateway} from "@/features/indexnow/infrastructure/http/fetch-indexnow-gateway";
import {
  createIndexNowKeyNotFoundResponse,
  createIndexNowKeyResponse,
  createIndexNowKeyUnavailableResponse,
} from "@/features/indexnow/presentation/http/indexnow-key-response";
import {
  presentIndexNowFailure,
  presentIndexNowSuccess,
} from "@/features/indexnow/presentation/presenters/indexnow-operation-presenter";
import {
  InvalidDeploymentEnvironmentConfigurationError,
  readDeploymentEnvironmentContract,
} from "@/shared/config/deployment-environment";
import {siteConfig} from "@/shared/config/site";

export async function getIndexNowKeyVerificationResponse(): Promise<Response> {
  let deploymentEnvironment: string;
  try {
    deploymentEnvironment = readDeploymentEnvironmentContract().deploymentEnvironment;
  } catch (error) {
    if (error instanceof InvalidDeploymentEnvironmentConfigurationError) {
      return createIndexNowKeyNotFoundResponse();
    }
    throw error;
  }

  if (deploymentEnvironment !== "production") return createIndexNowKeyNotFoundResponse();

  try {
    return createIndexNowKeyResponse(await new FileIndexNowKeyProvider().readKey());
  } catch (error) {
    if (error instanceof InvalidIndexNowKeyConfigurationError) {
      return createIndexNowKeyUnavailableResponse();
    }
    throw error;
  }
}

export async function runProductionIndexNowSubmission(): Promise<Readonly<{succeeded: boolean; output: string}>> {
  try {
    const deployment = readDeploymentEnvironmentContract();
    const result = await new SubmitIndexNow(
      {listIndexableUrls: listCanonicalIndexableUrls},
      new FileIndexNowKeyProvider(),
      new FetchIndexNowGateway(),
      siteConfig.url,
      new URL("/indexnow-key.txt", siteConfig.url).toString(),
    ).execute(deployment.deploymentEnvironment);
    return {succeeded: true, output: presentIndexNowSuccess(result)};
  } catch (error) {
    return {
      succeeded: false,
      output: error instanceof IndexNowSubmissionError
        ? presentIndexNowFailure(error.code)
        : presentIndexNowFailure("configuration_failure"),
    };
  }
}
