import { defineHandler } from "nitro";
import { sendTelegram, webAppUrl } from "../../../src/lib/telegram";

type Update = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

function miniAppUrl(event: { req: { headers: Headers } }): string {
  const configured = webAppUrl();
  if (configured) return configured;
  const host = event.req.headers.get("x-forwarded-host") || event.req.headers.get("host") || "";
  const proto = event.req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "";
  return `${proto}://${host.split(",")[0]?.trim()}/app`;
}

export default defineHandler(async (event) => {
  const update = (await event.req.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;
  const command = text.split(/\s+/)[0]?.split("@")[0] ?? "";
  if (!chatId || command !== "/start") return { ok: true };

  const url = miniAppUrl(event);
  if (!url) {
    console.error("[telegram] Mini App URL is empty");
    return { ok: true };
  }

  try {
    await sendTelegram(chatId, "Mr.Puff — электронные системы", {
      reply_markup: {
        keyboard: [[{ text: "Открыть магазин", web_app: { url } }]],
        resize_keyboard: true,
        is_persistent: true,
      },
    });
  } catch (err) {
    console.error("[telegram] /start failed", err);
  }
  return { ok: true };
});
