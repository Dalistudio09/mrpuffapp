import { readFile } from "node:fs/promises";
import { defineHandler } from "nitro";
import { sendTelegram, sendTelegramPhotoFile, webAppUrl } from "../../../src/lib/telegram";

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

async function readUpdate(event: { req: Request }): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await event.req.json();
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    /* try text */
  }
  try {
    const raw = await event.req.text();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function chatIdOf(update: Record<string, unknown> | null): number | null {
  if (!update) return null;
  const message = (update.message || update.edited_message) as { chat?: { id?: number }; text?: string } | undefined;
  const id = message?.chat?.id;
  return typeof id === "number" ? id : null;
}

function isStart(update: Record<string, unknown> | null): boolean {
  if (!update) return false;
  const message = (update.message || update.edited_message) as { text?: string } | undefined;
  const text = message?.text?.trim() ?? "";
  const command = text.split(/\s+/)[0]?.split("@")[0] ?? "";
  return command === "/start";
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
  const update = await readUpdate(event as { req: Request });
  const chatId = chatIdOf(update);
  if (!chatId || !isStart(update)) return { ok: true };

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

  try {
    await sendTelegram(chatId, WELCOME, { reply_markup: markup });
  } catch (err) {
    console.error("[telegram] text failed", err);
    return { ok: false, error: err instanceof Error ? err.message : "send-failed" };
  }
  return { ok: true };
});
