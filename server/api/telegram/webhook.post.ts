import { readFile } from "node:fs/promises";
import { defineHandler } from "nitro";
import { sendTelegram, sendTelegramPhotoFile, webAppUrl } from "../../../src/lib/telegram";

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

async function loadWelcome(): Promise<Blob | null> {
  const candidates = [
    "public/brand/welcome.jpg",
    "/var/task/public/brand/welcome.jpg",
    "/var/task/.vercel/output/static/brand/welcome.jpg",
  ];
  for (const path of candidates) {
    try {
      const bytes = await readFile(path);
      return new Blob([bytes], { type: "image/jpeg" });
    } catch {
      /* try next */
    }
  }
  return null;
}

export default defineHandler(async (event) => {
  const update = (await event.req.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chatId = update?.message?.chat?.id;
  const command = text.split(/\s+/)[0]?.split("@")[0] ?? "";
  if (!chatId || command !== "/start") return { ok: true };

  const url = miniAppUrl(event);
  if (!url) return { ok: false, error: "no-url" };

  const markup = {
    keyboard: [[{ text: "Открыть магазин", web_app: { url } }]],
    resize_keyboard: true,
    is_persistent: true,
  };

  try {
    const photo = await loadWelcome();
    if (photo) {
      await sendTelegramPhotoFile(chatId, photo, "welcome.jpg", WELCOME, markup);
      return { ok: true };
    }
  } catch (err) {
    console.error("[telegram] photo failed", err);
  }

  await sendTelegram(chatId, WELCOME, { reply_markup: markup });
  return { ok: true };
});
