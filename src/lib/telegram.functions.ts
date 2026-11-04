import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { inferFlavorTags, isFlavorTag } from "@/lib/flavors";
import { buildOrderMessage } from "@/lib/order-text";
import { isTelegramAdmin, sendTelegram, shopButton, verifyInitData } from "@/lib/telegram";
import type { FlavorTag, OrderItem, Product, ShopOrder } from "@/lib/types";

type ProductRow = {
  id: number;
  brand: string;
  model: string;
  flavor: string;
  flavor_types: string;
  price: number;
  image_url: string | null;
  active: boolean;
};

function fail(message: string): never {
  throw new Error(message);
}

function cleanText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") fail(`Укажите ${label}`);
  const text = value.trim();
  if (text.length < min || text.length > max) fail(`Проверьте поле «${label}»`);
  return text;
}

function cleanPrice(value: unknown): number {
  const price = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000) fail("Укажите цену целым числом");
  return price;
}

function cleanImageUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") fail("Некорректная ссылка на фото");
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("/") || url.startsWith("https://")) return url;
  fail("Ссылка на фото должна начинаться с https:// или /");
}

function cloudinaryCreds() {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "pshemfsk";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "716959298792494";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "dpUnoMNAqTxUEfX9RmWQ11L4phg";
  if (!cloud || !apiKey || !apiSecret) return null;
  return { cloud, apiKey, apiSecret };
}

async function sha1hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File): Promise<string> {
  const creds = cloudinaryCreds();
  if (!creds) fail("Cloudinary не настроен");
  const { cloud, apiKey, apiSecret } = creds;
  const timestamp = Math.round(Date.now() / 1000);
  const folder = "mr-puff";
  const signature = await sha1hex(`folder=${folder}&timestamp=${timestamp}${apiSecret}`);
  const body = new FormData();
  body.append("file", file);
  body.append("api_key", apiKey);
  body.append("timestamp", String(timestamp));
  body.append("signature", signature);
  body.append("folder", folder);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: "POST", body });
  if (!response.ok) fail("Не удалось загрузить фото");
  const json = (await response.json()) as { secure_url?: string };
  if (!json.secure_url) fail("Cloudinary не вернул ссылку");
  return json.secure_url;
}

function mapProduct(row: ProductRow): Product {
  return {
    id: Number(row.id),
    brand: row.brand,
    model: row.model,
    flavor: row.flavor,
    flavorTypes: row.flavor_types.split(",").filter(Boolean) as Product["flavorTypes"],
    price: Number(row.price),
    imageUrl: row.image_url,
    active: Boolean(row.active),
  };
}

function parseItems(value: unknown): OrderItem[] {
  const raw = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Partial<OrderItem>;
    return {
      productId: Number(row.productId),
      brand: String(row.brand ?? ""),
      model: String(row.model ?? ""),
      flavor: String(row.flavor ?? ""),
      price: Number(row.price),
      qty: Number(row.qty),
    };
  });
}

async function requireAdminUser(initData: string) {
  const user = verifyInitData(initData);
  if (!isTelegramAdmin(user.id)) fail("Нет доступа");
  return user;
}

type OrderIn = {
  initData: string;
  name: string;
  phone: string;
  address: string;
  comment?: string;
  items: { productId: number; qty: number }[];
};

export const placeTelegramOrder = createServerFn({ method: "POST" })
  .validator((data: OrderIn) => {
    const initData = typeof data?.initData === "string" ? data.initData : "";
    const name = cleanText(data?.name, "имя", 2, 80);
    const phoneRaw = cleanText(data?.phone, "телефон", 6, 24);
    const digits = phoneRaw.replace(/\D/g, "");
    if (digits.length !== 11 || !digits.startsWith("7") || !/^[0-9+\s()-]+$/.test(phoneRaw)) {
      fail("Укажите телефон в формате +7");
    }
    const address = cleanText(data?.address, "адрес", 3, 200);
    const comment = typeof data.comment === "string" ? data.comment.trim() : "";
    if (comment.length > 500) fail("Комментарий слишком длинный");
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 30) {
      fail("Корзина пуста");
    }
    const items = data.items.map((item) => {
      const productId = Number(item?.productId);
      const qty = Number(item?.qty);
      if (!Number.isInteger(productId) || productId < 1) fail("Некорректная позиция");
      if (!Number.isInteger(qty) || qty < 1 || qty > 20) fail("Проверьте количество");
      return { productId, qty };
    });
    return { initData, name, phone: phoneRaw, address, comment, items };
  })
  .handler(async ({ data }) => {
    const user = verifyInitData(data.initData);
    const sql = await getSql();
    const ids = [...new Set(data.items.map((item) => item.productId))];
    const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");
    const rows = await sql.query<ProductRow>(
      `select id, brand, model, flavor, flavor_types, price, image_url, active
       from products where id in (${placeholders})`,
      ids,
    );
    const byId = new Map(rows.map((row) => [Number(row.id), row]));
    const items: OrderItem[] = [];
    for (const item of data.items) {
      const row = byId.get(item.productId);
      if (!row || !row.active) fail("Некоторые позиции недоступны. Обновите каталог.");
      items.push({
        productId: Number(row.id),
        brand: row.brand,
        model: row.model,
        flavor: row.flavor,
        price: Number(row.price),
        qty: item.qty,
      });
    }
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const storedComment = [
      "Источник: Telegram",
      `Адрес: ${data.address}`,
      data.comment,
    ]
      .filter(Boolean)
      .join("\n");
    const inserted = await sql.query<{ id: number }>(
      `insert into orders (customer_name, phone, comment, total, items, source, telegram_user_id, telegram_chat_id)
       values ($1, $2, $3, $4, $5::jsonb, 'telegram', $6, $7)
       returning id`,
      [data.name, data.phone, storedComment, total, JSON.stringify(items), user.id, user.id],
    );
    const id = Number(inserted[0]?.id);
    if (!id) fail("Не удалось сохранить заявку. Попробуйте ещё раз.");
    await sql.query(
      `insert into telegram_customers (user_id, chat_id, first_name, username, last_order_at)
       values ($1, $2, $3, $4, now())
       on conflict (user_id) do update set
         chat_id = excluded.chat_id,
         first_name = excluded.first_name,
         username = excluded.username,
         last_order_at = now()`,
      [user.id, user.id, user.first_name ?? null, user.username ?? null],
    );
    const message = [
      `Новый заказ #${id} из Mini App`,
      buildOrderMessage({
        name: data.name,
        phone: data.phone,
        address: data.address,
        comment: data.comment,
        items,
        total,
      }),
      user.username ? `Telegram: @${user.username}` : `Telegram id: ${user.id}`,
    ].join("\n");
    const admins = [743736933, 6269955180];
    const errors: string[] = [];
    for (const adminId of admins) {
      try {
        await sendTelegram(adminId, message);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : "не отправилось");
      }
    }
    return { id, total, notified: errors.length < admins.length, notifyError: errors[0] ?? null };
  });

export const telegramWho = createServerFn({ method: "POST" })
  .validator((data: { initData?: string }) => ({
    initData: typeof data?.initData === "string" ? data.initData : "",
  }))
  .handler(async ({ data }) => {
    if (!data.initData) return { ok: false as const, isAdmin: false, userId: null, name: "" };
    try {
      const user = verifyInitData(data.initData);
      return {
        ok: true as const,
        isAdmin: isTelegramAdmin(user.id),
        userId: user.id,
        name: user.first_name || user.username || "",
      };
    } catch {
      return { ok: false as const, isAdmin: false, userId: null, name: "" };
    }
  });

export const telegramAdmin = createServerFn({ method: "POST" })
  .validator((data: { initData?: string }) => ({
    initData: typeof data?.initData === "string" ? data.initData : "",
  }))
  .handler(async ({ data }) => {
    await requireAdminUser(data.initData);
    const sql = await getSql();
    const products = (
      await sql<ProductRow>`
        select id, brand, model, flavor, flavor_types, price, image_url, active
        from products
        order by sort_order, id
      `
    ).map(mapProduct);
    const rows = await sql<{
      id: number;
      customer_name: string;
      phone: string;
      comment: string;
      total: number;
      items: unknown;
      created_at: string;
      source: string;
    }>`
      select id, customer_name, phone, comment, total, items, source,
             to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
      from orders
      order by id desc
      limit 80
    `;
    const orders: (ShopOrder & { source: string })[] = rows.map((row) => ({
      id: Number(row.id),
      customerName: row.customer_name,
      phone: row.phone,
      comment: row.comment,
      total: Number(row.total),
      items: parseItems(row.items),
      createdAt: row.created_at,
      source: row.source || "web",
    }));
    const audience = await sql<{ count: number }>`select count(*)::int as count from telegram_customers`;
    return { products, orders, audience: Number(audience[0]?.count ?? 0) };
  });

export const sendRestock = createServerFn({ method: "POST" })
  .validator((data: { initData?: string; text?: string }) => {
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (text.length < 2 || text.length > 500) fail("Напишите текст уведомления");
    return {
      initData: typeof data?.initData === "string" ? data.initData : "",
      text,
    };
  })
  .handler(async ({ data }) => {
    await requireAdminUser(data.initData);
    const sql = await getSql();
    const customers = await sql<{ chat_id: number }>`select chat_id from telegram_customers`;
    if (customers.length === 0) fail("Пока некому писать: ещё нет заказов из Mini App");
    const button = shopButton();
    let sent = 0;
    let failed = 0;
    for (const customer of customers) {
      try {
        await sendTelegram(customer.chat_id, data.text, button ? { reply_markup: button } : undefined);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    if (sent === 0) fail("Не удалось отправить. Проверьте TELEGRAM_BOT_TOKEN.");
    return { sent, failed, audience: customers.length };
  });

type ProductIn = {
  initData?: string;
  id?: number | null;
  brand?: string;
  model?: string;
  flavor?: string;
  price?: number;
  imageUrl?: string | null;
  active?: boolean;
};

export const telegramSaveProduct = createServerFn({ method: "POST" })
  .validator((data: ProductIn) => {
    const id = data.id == null || data.id === 0 ? null : Number(data.id);
    if (id != null && (!Number.isInteger(id) || id < 1)) fail("Некорректный товар");
    const flavor = cleanText(data.flavor, "вкус", 1, 80);
    const tags = inferFlavorTags(flavor).filter(isFlavorTag);
    return {
      initData: typeof data.initData === "string" ? data.initData : "",
      id,
      brand: cleanText(data.brand, "бренд", 1, 40),
      model: cleanText(data.model, "модель", 1, 60),
      flavor,
      flavorTypes: (tags.length ? tags : ["other"]) as FlavorTag[],
      price: cleanPrice(data.price),
      imageUrl: cleanImageUrl(data.imageUrl),
      active: data.active !== false,
    };
  })
  .handler(async ({ data }) => {
    await requireAdminUser(data.initData);
    const sql = await getSql();
    const types = data.flavorTypes.join(",");
    try {
      if (data.id == null) {
        await sql.query(
          `insert into products (brand, model, flavor, flavor_types, price, image_url, active, sort_order)
           values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(sort_order), 0) + 1 from products))`,
          [data.brand, data.model, data.flavor, types, data.price, data.imageUrl, data.active],
        );
      } else {
        const rows = await sql.query<{ id: number }>(
          `update products
           set brand = $1, model = $2, flavor = $3, flavor_types = $4, price = $5, image_url = $6, active = $7
           where id = $8 returning id`,
          [data.brand, data.model, data.flavor, types, data.price, data.imageUrl, data.active, data.id],
        );
        if (!rows[0]) fail("Товар не найден");
      }
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code === "23505" || /unique/i.test(error.message ?? "")) fail("Такая позиция уже есть");
      throw err;
    }
    return { ok: true };
  });

export const telegramDeleteProduct = createServerFn({ method: "POST" })
  .validator((data: { initData?: string; id?: number }) => {
    const id = Number(data?.id);
    if (!Number.isInteger(id) || id < 1) fail("Некорректный товар");
    return { initData: typeof data?.initData === "string" ? data.initData : "", id };
  })
  .handler(async ({ data }) => {
    await requireAdminUser(data.initData);
    const sql = await getSql();
    await sql.query(`delete from products where id = $1`, [data.id]);
    return { ok: true };
  });

export const telegramUploadImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) fail("Ожидался файл");
    return data;
  })
  .handler(async ({ data }) => {
    await requireAdminUser(String(data.get("initData") ?? ""));
    const file = data.get("file");
    if (!(file instanceof File)) fail("Выберите фото");
    if (file.size <= 0 || file.size > 3_500_000) fail("Фото должно быть меньше 3.5 МБ");
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (file.type && !allowed.has(file.type)) fail("Нужен файл JPG, PNG или WebP");
    const imageUrl = await uploadToCloudinary(file);
    const idRaw = data.get("productId");
    const id = typeof idRaw === "string" && idRaw ? Number(idRaw) : null;
    if (id != null) {
      if (!Number.isInteger(id) || id < 1) fail("Некорректный товар");
      const sql = await getSql();
      const rows = await sql.query<{ id: number }>(
        `update products set image_url = $1 where id = $2 returning id`,
        [imageUrl, id],
      );
      if (!rows[0]) fail("Товар не найден");
    }
    return { imageUrl };
  });
