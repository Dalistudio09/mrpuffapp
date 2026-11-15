import { readFile } from "node:fs/promises";
import { defineHandler } from "nitro";
import { sendTelegram, sendTelegramPhotoFile, webAppUrl } from "../../../src/lib/telegram";
import { logWebhook } from "../../../src/lib/telegram-log";

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

async function readUpdate(event: { req: Request }): Promise<{ update: Record<string, unknown> | null; rawError?: string }> {
  try {
    const parsed = await event.req.json();
    if (parsed && typeof parsed === "object") return { update: parsed as Record<string, unknown> };
    return { update: null, rawError: "body-not-object" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "json-failed";
    try {
      const raw = await event.req.text();
      if (!raw) return { update: null, rawError: message };
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") return { update: parsed as Record<string, unknown> };
      return { update: null, rawError: "text-not-object" };
    } catch {
      return { update: null, rawError: message };
    }
  }
}

function chatIdOf(update: Record<string, unknown> | null): number | null {
  if (!update) return null;
  const message = (update.message || update.edited_message) as { chat?: { id?: number } } | undefined;
  const id = message?.chat?.id;
  return typeof id === "number" ? id : null;
}

function commandOf(update: Record<string, unknown> | null): string {
  if (!update) return "";
  const message = (update.message || update.edited_message) as { text?: string } | undefined;
  return message?.text?.trim().split(/\s+/)[0]?.split("@")[0] ?? "";
}

async function loadWelcome(site: string): Promise<Blob | null> {
  if (site) {
    try {
      const response = await fetch(`${site}/brand/welcome.jpg`);
      if (response.ok) return await response.blob();
    } catch {
      /* try local files */
    }
  }
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
  const { update, rawError } = await readUpdate(event as { req: Request });
  const chatId = chatIdOf(update);
  const command = commandOf(update);
  const updateId = typeof update?.update_id === "number" ? update.update_id : null;

  if (!chatId || command !== "/start") {
    await logWebhook({
      step: "ignored",
      updateId,
      command: command || null,
      chatId,
      rawError: rawError ?? null,
    });
    return { ok: true };
  }

  const url = miniAppUrl(event);
  if (!url) {
    await logWebhook({ step: "no-url", updateId, chatId });
    return { ok: false, error: "no-url" };
  }

  const markup = {
    inline_keyboard: [[{ text: "Открыть магазин", web_app: { url } }]],
  };

  try {
    const photo = await loadWelcome(origin(event) || "https://mrpuffapp.vercel.app");
    if (photo) {
      await sendTelegramPhotoFile(chatId, photo, "welcome.jpg", WELCOME, markup);
      await logWebhook({ step: "sent-photo", updateId, chatId });
      return { ok: true };
    }
    await logWebhook({ step: "no-photo", updateId, chatId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "photo-failed";
    await logWebhook({ step: "photo-failed", updateId, chatId, error: message });
  }

  try {
    await sendTelegram(chatId, WELCOME, { reply_markup: markup });
    await logWebhook({ step: "sent-text", updateId, chatId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "send-failed";
    await logWebhook({ step: "text-failed", updateId, chatId, error: message });
    return { ok: false, error: message };
  }
  return { ok: true };
});
