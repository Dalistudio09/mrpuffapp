import { defineHandler } from "nitro";
import { shopButton, sendTelegram, webAppUrl } from "../../../src/lib/telegram";

type Update = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export default defineHandler(async (event) => {
  const update = (await event.req.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;
  if (!chatId || !text.startsWith("/start")) return { ok: true };

  const url = webAppUrl();
  const markup = shopButton();
  try {
    await sendTelegram(chatId, "Mr.Puff — электронные системы", markup ? { reply_markup: markup } : undefined);
  } catch (err) {
    console.error("[telegram] /start failed", err);
    if (!url) console.error("[telegram] set TELEGRAM_WEBAPP_URL or VERCEL_URL");
  }
  return { ok: true };
});
