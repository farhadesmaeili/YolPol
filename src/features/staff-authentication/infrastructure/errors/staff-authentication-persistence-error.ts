export class StaffAuthenticationPersistenceError extends Error {
  readonly name = "StaffAuthenticationPersistenceError";

  constructor() { super("Staff authentication persistence is unavailable."); }
}

