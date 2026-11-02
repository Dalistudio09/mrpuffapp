import { createHmac, timingSafeEqual } from "node:crypto";

export const TELEGRAM_ADMIN_IDS = [743736933, 6269955180];

export type TgUser = {
  id: number;
  first_name?: string;
  username?: string;
};

export function botToken(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token || null;
}

export function requireBotToken(): string {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN не задан в переменных Vercel");
  return token;
}

export function webAppUrl(): string {
  const configured = process.env.TELEGRAM_WEBAPP_URL?.trim();
  let url = configured ? configured.replace(/\/$/, "") : "";
  if (!url) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
    if (host) url = `https://${host.replace(/^https?:\/\//, "")}`;
  }
  if (!url) return "";
  if (!url.endsWith("/app")) url = `${url}/app`;
  return url;
}

export function isTelegramAdmin(id: number): boolean {
  const extra = (process.env.TELEGRAM_ADMIN_IDS || "")
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  return TELEGRAM_ADMIN_IDS.includes(id) || extra.includes(id);
}

export function verifyInitData(initData: string): TgUser {
  const token = requireBotToken();
  if (!initData || initData.length < 10) throw new Error("Откройте магазин из Telegram");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Нет подписи Telegram");
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(hash);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Подпись Telegram не совпала");
  }
  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > 60 * 60 * 24) {
    throw new Error("Сессия Telegram устарела. Откройте магазин заново.");
  }
  const raw = params.get("user");
  if (!raw) throw new Error("Нет пользователя Telegram");
  const user = JSON.parse(raw) as TgUser;
  if (!user?.id) throw new Error("Нет пользователя Telegram");
  return user;
}

export async function sendTelegram(
  chatId: number | string,
  text: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const token = requireBotToken();
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram ${response.status}: ${body.slice(0, 180)}`);
  }
}

export function shopButton() {
  const url = webAppUrl();
  if (!url) return undefined;
  return {
    inline_keyboard: [[{ text: "Открыть магазин", web_app: { url } }]],
  };
}
