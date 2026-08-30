export class TelegramStaffOnboardingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramStaffOnboardingValidationError";
  }
}

export class TelegramStaffOnboardingPersistenceError extends Error {
  constructor() {
    super("Telegram Staff onboarding persistence failed.");
    this.name = "TelegramStaffOnboardingPersistenceError";
  }
}
