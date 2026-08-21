import "server-only";

import type {InquiryRepository} from "@/features/inquiries/application/ports/inquiry-ports";
import {getInquiryPostgresPool} from "@/features/inquiries/infrastructure/database/postgres-pool";
import {PostgresInquiryRepository} from "@/features/inquiries/infrastructure/persistence/postgres/repositories/postgres-inquiry-repository";

let repository: InquiryRepository | undefined;

export function getInquiryRepository(): InquiryRepository {
  repository ??= new PostgresInquiryRepository(getInquiryPostgresPool());
  return repository;
}
