import "server-only";

import {createAiOperations, type AiOperations} from "@/composition/ai-operations/ai-operations-factory";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";

export {createAiOperations};
export type {AiOperations};

let operations: AiOperations | undefined;

export function getAiOperations(): AiOperations {
  if (operations) return operations;
  operations = createAiOperations(getInquiryPostgresPool());
  return operations;
}
