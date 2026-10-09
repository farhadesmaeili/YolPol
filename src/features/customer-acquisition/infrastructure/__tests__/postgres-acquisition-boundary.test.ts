import {Pool} from "pg";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {AcquisitionValidationError} from "@/features/customer-acquisition/domain/types/acquisition-types";
import {PostgresAcquisitionRepository} from "@/features/customer-acquisition/infrastructure/persistence/postgres/repositories/postgres-acquisition-repository";
import {parseObservation} from "@/features/customer-acquisition/infrastructure/validation/acquisition-input";
import {syntheticObservation} from "@/features/customer-acquisition/testing/fixtures/acquisition-fixtures";

const {transaction} = vi.hoisted(() => ({transaction: vi.fn()}));
vi.mock("drizzle-orm/node-postgres", () => ({drizzle: () => ({transaction})}));

describe("ACQ-01 direct repository validation before transactions", () => {
  const transactionBoundary = new Error("Transaction boundary reached; no database connected.");
  let pool: Pool;
  let repository: PostgresAcquisitionRepository;
  beforeEach(() => {
    transaction.mockReset().mockRejectedValue(transactionBoundary);
    pool = new Pool();
    repository = new PostgresAcquisitionRepository(pool);
  });
  afterEach(async () => { await pool.end(); });

  it.each([
    ["NFC expansion", "\u0344".repeat(160)],
    ["already expanded NFC", "\u0308\u0301".repeat(160)],
    ["mixed NFC overflow", `${"Q".repeat(159)}\u0344`],
    ["supplementary UTF-16 overflow", "\u{1f600}".repeat(81)],
    ["ASCII overflow", "A".repeat(161)],
    ["empty after trim", "   "],
  ])("rejects contact %s at both input boundaries without persistence", async (_label, name) => {
    const input = parseObservation(syntheticObservation());
    await expect(repository.ingest({...input, contact: {name, email: "Test@bottler.example", normalizedEmail: "Test@bottler.example"}})).rejects.toBeInstanceOf(AcquisitionValidationError);
    expect(transaction).not.toHaveBeenCalled();
    expect(() => parseObservation(syntheticObservation({contact: {name, email: "Test@bottler.example"}}))).toThrow(AcquisitionValidationError);
  });

  it.each(["\u0130".repeat(160), "\u0344".repeat(160)])("retains company validation before transactions (%#)", async (name) => {
    const input = parseObservation(syntheticObservation());
    await expect(repository.ingest({...input, company: {...input.company, name}})).rejects.toBeInstanceOf(AcquisitionValidationError);
    expect(transaction).not.toHaveBeenCalled();
  });

  // Successful storage and canonical replay are asserted against real PostgreSQL.
  // This sentinel proves valid inputs reach the boundary without mocking a success.
  it.each(["Synthetic Contact", " Cafe\u0301 ", "\u0344".repeat(80), "\u{1f600}".repeat(80), "A".repeat(160)])("admits valid contact names without mutating the caller (%#)", async (name) => {
    const input = {...parseObservation(syntheticObservation()), contact: Object.freeze({name, email: "Test@bottler.example", normalizedEmail: "Test@bottler.example"})};
    await expect(repository.ingest(Object.freeze(input))).rejects.toBe(transactionBoundary);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(input.contact.name).toBe(name);
  });

  it("preserves the absent-contact null contract", async () => {
    const input = parseObservation(syntheticObservation());
    expect(input.contact).toBeNull();
    await expect(repository.ingest(input)).rejects.toBe(transactionBoundary);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
