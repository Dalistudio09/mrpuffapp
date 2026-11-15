import { defineHandler } from "nitro";
import { webAppUrl } from "../../../src/lib/telegram";

export default defineHandler(() => ({
  ok: true,
  bot: "themrpuffbot",
  token: Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim() || process.env.BOT_TOKEN?.trim()),
  app: webAppUrl() || null,
}));
