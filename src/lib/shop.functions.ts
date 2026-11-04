import { createServerFn } from "@tanstack/react-start";
import { deleteCookie, getCookie, getRequestIP, setCookie } from "@tanstack/react-start/server";
import { getSql } from "@/lib/db";
import { isWorkspacePreview } from "@/lib/env.server";
import { isFlavorTag } from "@/lib/flavors";
import { buildOrderMessage, whatsappHref } from "@/lib/order-text";
import type { AdminState, FlavorTag, OrderItem, Product, ShopOrder, StorefrontData } from "@/lib/types";

const COOKIE = "mrpuff_admin";
const TAGS: FlavorTag[] = ["berries", "mint", "fruit", "soda", "sweet", "other"];

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

type OrderRow = {
  id: number;
  customer_name: string;
  phone: string;
  comment: string;
  total: number;
  items: unknown;
  created_at: string;
};

function fail(message: string): never {
  throw new Error(message);
}

function bytesToB64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? "" : "=".repeat(4 - (value.length % 4));
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    "mrpuff-preview-session-key"
  );
}

function adminAccess(): { password: string | null; previewHint: string | null; passwordReady: boolean } {
  const configured = process.env.ADMIN_PASSWORD?.trim();
  if (configured) return { password: configured, previewHint: null, passwordReady: true };
  return { password: "admin123", previewHint: isWorkspacePreview() ? "admin123" : null, passwordReady: true };
}

function cloudinaryCreds(): { cloud: string; apiKey: string; apiSecret: string } | null {
  const cloud = process.env.CLOUDINARY_CLOUD_NAME?.trim() || "pshemfsk";
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim() || "716959298792494";
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim() || "dpUnoMNAqTxUEfX9RmWQ11L4phg";
  if (!cloud || !apiKey || !apiSecret) return null;
  return { cloud, apiKey, apiSecret };
}

function cloudinaryReady(): boolean {
  return cloudinaryCreds() !== null;
}

async function hmac(value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return bytesToB64url(new Uint8Array(sig));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readAdmin(): Promise<boolean> {
  const token = getCookie(COOKIE);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmac(payload);
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(new TextDecoder().decode(b64urlToBytes(payload))) as {
      role?: string;
      exp?: number;
    };
    return data.role === "admin" && typeof data.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
}

async function requireAdmin(): Promise<void> {
  if (!(await readAdmin())) fail("Нужен вход администратора");
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  };
}

async function issueSession(): Promise<void> {
  const payload = bytesToB64url(
    new TextEncoder().encode(JSON.stringify({ role: "admin", exp: Date.now() + 1000 * 60 * 60 * 24 * 14 })),
  );
  const token = `${payload}.${await hmac(payload)}`;
  setCookie(COOKIE, token, cookieOptions());
}

function mapProduct(row: ProductRow): Product {
  const flavorTypes = row.flavor_types.split(",").filter(isFlavorTag);
  return {
    id: Number(row.id),
    brand: row.brand,
    model: row.model,
    flavor: row.flavor,
    flavorTypes,
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

async function listProducts(activeOnly: boolean): Promise<Product[]> {
  const sql = await getSql();
  const rows = activeOnly
    ? await sql<ProductRow>`
        select id, brand, model, flavor, flavor_types, price, image_url, active
        from products
        where active = true
        order by sort_order, id
      `
    : await sql<ProductRow>`
        select id, brand, model, flavor, flavor_types, price, image_url, active
        from products
        order by sort_order, id
      `;
  return rows.map(mapProduct);
}

async function readWhatsapp(): Promise<string> {
  const sql = await getSql();
  const rows = await sql<{ value: string }>`select value from shop_settings where key = 'whatsapp_phone'`;
  return rows[0]?.value ?? "";
}

async function listOrders(): Promise<ShopOrder[]> {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    select id, customer_name, phone, comment, total, items,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from orders
    order by id desc
    limit 200
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    customerName: row.customer_name,
    phone: row.phone,
    comment: row.comment,
    total: Number(row.total),
    items: parseItems(row.items),
    createdAt: row.created_at,
  }));
}

async function adminPayload(authed: boolean): Promise<AdminState> {
  const access = adminAccess();
  if (!authed) {
    return {
      authed: false,
      passwordReady: access.passwordReady,
      previewHint: access.previewHint,
      cloudinary: cloudinaryReady(),
      whatsappPhone: "",
      products: [],
      orders: [],
    };
  }
  const [products, orders, whatsappPhone] = await Promise.all([
    listProducts(false),
    listOrders(),
    readWhatsapp(),
  ]);
  return {
    authed: true,
    passwordReady: access.passwordReady,
    previewHint: null,
    cloudinary: cloudinaryReady(),
    whatsappPhone,
    products,
    orders,
  };
}

const hits = new Map<string, number[]>();

function rateLimit(key: string): void {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < 60_000);
  if (recent.length >= 8) fail("Слишком много заявок. Подождите минуту.");
  recent.push(now);
  hits.set(key, recent);
}

function cleanText(value: unknown, label: string, min: number, max: number): string {
  if (typeof value !== "string") fail(`Укажите ${label}`);
  const text = value.trim();
  if (text.length < min || text.length > max) fail(`Проверьте поле «${label}»`);
  return text;
}

function cleanPrice(value: unknown): number {
  const price = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(price) || price < 0 || price > 1_000_000) {
    fail("Укажите цену целым числом в тенге");
  }
  return price;
}

function cleanImageUrl(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") fail("Некорректная ссылка на фото");
  const url = value.trim();
  if (!url) return null;
  if (url.startsWith("data:")) fail("В базе хранится только ссылка на фото, не сам файл.");
  if (url.startsWith("/") || url.startsWith("https://")) return url;
  fail("Ссылка на фото должна начинаться с https:// или /");
}

function cleanTags(value: unknown): FlavorTag[] {
  if (!Array.isArray(value)) fail("Выберите тип вкуса");
  const tags = value.filter((tag): tag is FlavorTag => typeof tag === "string" && isFlavorTag(tag));
  if (tags.length === 0) fail("Выберите тип вкуса");
  return TAGS.filter((tag) => tags.includes(tag));
}

type ProductInput = {
  id?: number | null;
  brand: string;
  model: string;
  flavor: string;
  flavorTypes: FlavorTag[];
  price: number;
  imageUrl: string | null;
  active: boolean;
};

function parseProductInput(data: ProductInput): ProductInput {
  const id = data.id == null || data.id === 0 ? null : Number(data.id);
  if (id != null && (!Number.isInteger(id) || id < 1)) fail("Некорректный товар");
  return {
    id,
    brand: cleanText(data.brand, "бренд", 1, 40),
    model: cleanText(data.model, "модель", 1, 60),
    flavor: cleanText(data.flavor, "вкус", 1, 80),
    flavorTypes: cleanTags(data.flavorTypes),
    price: cleanPrice(data.price),
    imageUrl: cleanImageUrl(data.imageUrl),
    active: Boolean(data.active),
  };
}

function isUniqueError(err: unknown): boolean {
  const error = err as { code?: string; message?: string };
  return error.code === "23505" || /unique/i.test(error.message ?? "");
}

async function sha1hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function uploadToCloudinary(file: File): Promise<string> {
  const creds = cloudinaryCreds();
  if (!creds) {
    fail("Cloudinary не настроен. Задайте CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY и CLOUDINARY_API_SECRET.");
  }
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
  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, {
    method: "POST",
    body,
  });
  if (!response.ok) fail("Не удалось загрузить фото. Проверьте ключи Cloudinary.");
  const json = (await response.json()) as { secure_url?: string };
  if (!json.secure_url) fail("Cloudinary не вернул ссылку на фото.");
  return json.secure_url;
}

export const getStorefront = createServerFn({ method: "GET" }).handler(async (): Promise<StorefrontData> => {
  const [products, whatsappPhone] = await Promise.all([listProducts(true), readWhatsapp()]);
  return { products, whatsappPhone };
});

export const adminState = createServerFn({ method: "GET" }).handler(async (): Promise<AdminState> => {
  return adminPayload(await readAdmin());
});

export const adminLogin = createServerFn({ method: "POST" })
  .validator((data: { password?: string }) => {
    if (!data || typeof data.password !== "string") fail("Введите пароль");
    return { password: data.password };
  })
  .handler(async ({ data }): Promise<AdminState> => {
    const access = adminAccess();
    if (!access.password) fail("Задайте ADMIN_PASSWORD в настройках публикации.");
    if (!safeEqual(data.password, access.password)) fail("Неверный пароль");
    await issueSession();
    return adminPayload(true);
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async (): Promise<AdminState> => {
  deleteCookie(COOKIE, { path: "/" });
  return adminPayload(false);
});

export const saveProduct = createServerFn({ method: "POST" })
  .validator((data: ProductInput) => parseProductInput(data))
  .handler(async ({ data }) => {
    await requireAdmin();
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
           where id = $8
           returning id`,
          [data.brand, data.model, data.flavor, types, data.price, data.imageUrl, data.active, data.id],
        );
        if (!rows[0]) fail("Товар не найден");
      }
    } catch (err) {
      if (isUniqueError(err)) fail("Такая позиция уже есть");
      throw err;
    }
    return adminPayload(true);
  });

export const setProductActive = createServerFn({ method: "POST" })
  .validator((data: { id?: number; active?: boolean }) => {
    const id = Number(data?.id);
    if (!Number.isInteger(id) || id < 1) fail("Некорректный товар");
    return { id, active: Boolean(data.active) };
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const sql = await getSql();
    await sql.query(`update products set active = $1 where id = $2`, [data.active, data.id]);
    return adminPayload(true);
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .validator((data: { id?: number }) => {
    const id = Number(data?.id);
    if (!Number.isInteger(id) || id < 1) fail("Некорректный товар");
    return { id };
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const sql = await getSql();
    await sql.query(`delete from products where id = $1`, [data.id]);
    return adminPayload(true);
  });

export const saveWhatsapp = createServerFn({ method: "POST" })
  .validator((data: { phone?: string }) => {
    const phone = typeof data?.phone === "string" ? data.phone.trim() : "";
    if (phone && !/^[0-9+\s()-]{8,20}$/.test(phone)) fail("Некорректный номер WhatsApp");
    return { phone };
  })
  .handler(async ({ data }) => {
    await requireAdmin();
    const sql = await getSql();
    await sql.query(
      `insert into shop_settings (key, value) values ('whatsapp_phone', $1)
       on conflict (key) do update set value = excluded.value`,
      [data.phone],
    );
    return adminPayload(true);
  });

export const uploadProductImage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (!(data instanceof FormData)) fail("Ожидался файл");
    return data;
  })
  .handler(async ({ data }) => {
    await requireAdmin();
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

type OrderIn = {
  name: string;
  phone: string;
  address: string;
  comment?: string;
  items: { productId: number; qty: number }[];
};

export const placeOrder = createServerFn({ method: "POST" })
  .validator((data: OrderIn) => {
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
    return { name, phone: phoneRaw, address, comment, items };
  })
  .handler(async ({ data }) => {
    rateLimit(getRequestIP() || "unknown");
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
    const storedComment = data.comment ? `Адрес: ${data.address}\n${data.comment}` : `Адрес: ${data.address}`;
    const inserted = await sql.query<{ id: number }>(
      `insert into orders (customer_name, phone, comment, total, items)
       values ($1, $2, $3, $4, $5::jsonb)
       returning id`,
      [data.name, data.phone, storedComment, total, JSON.stringify(items)],
    );
    const id = Number(inserted[0]?.id);
    if (!id) fail("Не удалось сохранить заявку. Попробуйте ещё раз.");
    const message = buildOrderMessage({
      name: data.name,
      phone: data.phone,
      address: data.address,
      comment: data.comment,
      items,
      total,
    });
    const phone = "+7 707 909 80 70";
    return { id, total, whatsappUrl: whatsappHref(phone, message) };
  });
