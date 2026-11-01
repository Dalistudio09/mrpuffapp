import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import { buildOrderMessage } from "@/lib/order-text";
import { isTelegramAdmin, sendTelegram, shopButton, verifyInitData, webAppUrl } from "@/lib/telegram";
import type { OrderItem, Product, ShopOrder } from "@/lib/types";

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
        where active = true
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
  .validator((data: { initData?: string; productId?: number; note?: string }) => {
    const productId = Number(data?.productId);
    if (!Number.isInteger(productId) || productId < 1) fail("Выберите товар");
    const note = typeof data?.note === "string" ? data.note.trim().slice(0, 300) : "";
    return {
      initData: typeof data?.initData === "string" ? data.initData : "",
      productId,
      note,
    };
  })
  .handler(async ({ data }) => {
    await requireAdminUser(data.initData);
    const sql = await getSql();
    const rows = await sql<ProductRow>`
      select id, brand, model, flavor, flavor_types, price, image_url, active
      from products where id = ${data.productId} and active = true
    `;
    const product = rows[0];
    if (!product) fail("Товар не найден");
    const customers = await sql<{ chat_id: number }>`select chat_id from telegram_customers`;
    if (customers.length === 0) fail("Пока некому писать: ещё нет заказов из Mini App");
    const text = [
      "Mr.Puff — пополнение",
      "",
      `${product.brand} ${product.model}`,
      product.flavor,
      data.note,
      "",
      "Откройте магазин и закажите.",
    ]
      .filter((line) => line !== undefined && line !== "")
      .join("\n");
    const button = shopButton();
    let sent = 0;
    let failed = 0;
    for (const customer of customers) {
      try {
        await sendTelegram(customer.chat_id, text, button ? { reply_markup: button } : undefined);
        sent += 1;
      } catch {
        failed += 1;
      }
    }
    if (sent === 0) fail("Не удалось отправить. Проверьте TELEGRAM_BOT_TOKEN и TELEGRAM_WEBAPP_URL.");
    return { sent, failed, audience: customers.length, url: webAppUrl() };
  });
