import {runSetTelegramWebhook} from "./telegram-webhook-commands";
import {TelegramWebhookClient} from "./telegram-webhook-client";
import {
  loadTelegramWebhookToolingEnvironment,
  readTelegramWebhookSetToolingConfig,
} from "./telegram-webhook-config";

export async function main(): Promise<void> {
  try {
    if (process.argv.slice(2).length > 0) throw new Error("Arguments are not supported.");
    loadTelegramWebhookToolingEnvironment();
    const config = readTelegramWebhookSetToolingConfig();
    await runSetTelegramWebhook({
      config,
      client: new TelegramWebhookClient(config.botToken),
      logger: console,
    });
    process.exitCode = 0;
  } catch {
    console.error("Telegram webhook configuration failed.");
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main().catch(() => {
    console.error("Telegram webhook configuration failed.");
    process.exitCode = 1;
  });
}
