import { defineHandler } from "nitro";
import { getSql } from "../../../src/lib/db";
import { sendTelegramPhoto, webAppUrl } from "../../../src/lib/telegram";

type Update = {
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

const WELCOME = "Добро пожаловать! У нас широкий ассортимент продукции.";

function origin(event: { req: { headers: Headers } }): string {
  const configured = process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      /* fall through */
    }
  }
  const host = event.req.headers.get("x-forwarded-host") || event.req.headers.get("host") || "";
  const proto = event.req.headers.get("x-forwarded-proto") || "https";
  if (!host) return "";
  return `${proto}://${host.split(",")[0]?.trim()}`;
}

function miniAppUrl(event: { req: { headers: Headers } }): string {
  const configured = webAppUrl();
  if (configured) return configured;
  const base = origin(event);
  return base ? `${base}/app` : "";
}

export default defineHandler(async (event) => {
  const update = (await event.req.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;
  const command = text.split(/\s+/)[0]?.split("@")[0] ?? "";
  if (!chatId || command !== "/start") return { ok: true };

  const url = miniAppUrl(event);
  const site = origin(event);
  if (!url || !site) {
    console.error("[telegram] Mini App URL is empty");
    return { ok: true };
  }

  const key = `tg_start_${chatId}`;
  try {
    const sql = await getSql();
    const seen = await sql<{ value: string }>`select value from shop_settings where key = ${key}`;
    if (seen[0]) return { ok: true };
  } catch (err) {
    console.error("[telegram] start dedupe skipped", err);
  }

  try {
    await sendTelegramPhoto(chatId, `${site}/brand/welcome.jpg`, WELCOME, {
      reply_markup: {
        keyboard: [[{ text: "Открыть магазин", web_app: { url } }]],
        resize_keyboard: true,
        is_persistent: true,
      },
    });
    const sql = await getSql();
    await sql.query(
      `insert into shop_settings (key, value) values ($1, $2) on conflict (key) do nothing`,
      [key, new Date().toISOString()],
    );
  } catch (err) {
    console.error("[telegram] /start failed", err);
  }
  return { ok: true };
});
