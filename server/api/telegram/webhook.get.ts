import { defineHandler } from "nitro";
import { webAppUrl } from "../../../src/lib/telegram";
import { readWebhookLog } from "../../../src/lib/telegram-log";

export default defineHandler(async () => ({
  ok: true,
  bot: "themrpuffbot",
  token: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim()),
  app: webAppUrl() || null,
  last: await readWebhookLog(),
}));
