import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { Button, buttonClass, fieldClass } from "@/components/button";
import { DeviceArt } from "@/components/device-art";
import { cn } from "@/lib/cn";
import { cartCount, cartTotal, useCart, type CartLine } from "@/lib/cart-store";
import { lineKey } from "@/lib/flavors";
import { formatPrice, formatWhen } from "@/lib/format";
import { placeTelegramOrder, sendRestock, telegramAdmin, telegramDeleteProduct, telegramSaveProduct, telegramUploadImage, telegramWho } from "@/lib/telegram.functions";
import { FLAVOR_TAGS, type FlavorTag, type Product } from "@/lib/types";

type TgWebApp = {
  initData: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string } };
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  safeAreaInset?: { top?: number; bottom?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number };
};

const ADMIN_IDS = [743736933, 6269955180];

function telegram(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp ?? null;
}

function formatPhone(digits: string): string {
  if (!digits) return "";
  const rest = digits.slice(1, 11);
  let out = "+7";
  if (!rest) return out;
  out += ` (${rest.slice(0, 3)}`;
  if (rest.length >= 3) out += ")";
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
  return out;
}

function applyPhone(nextRaw: string, previous: string): string {
  const prevDigits = previous.replace(/\D/g, "");
  let digits = nextRaw.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits && !digits.startsWith("7")) digits = `7${digits}`;
  if (nextRaw.length < previous.length && digits.length === prevDigits.length) digits = digits.slice(0, -1);
  return formatPhone(digits.slice(0, 11));
}

function photoSrc(url: string): string {
  return url.startsWith("/catalog/") ? `${url}?v=5` : url;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Не получилось выполнить действие";
}

const CHIP_ORDER = ["WAKA", "ELF BAR", "PLONQ", "FASTA"];

type LineGroup = {
  key: string;
  brand: string;
  model: string;
  price: number;
  imageUrl: string | null;
  items: Product[];
};

function groupLines(products: Product[]): LineGroup[] {
  const map = new Map<string, Product[]>();
  for (const product of products) {
    const key = lineKey(product.brand, product.model);
    const list = map.get(key) ?? [];
    list.push(product);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, items]) => ({
    key,
    brand: items[0]?.brand ?? "",
    model: items[0]?.model ?? "",
    price: items[0]?.price ?? 0,
    imageUrl: items[0]?.imageUrl ?? null,
    items,
  }));
}

function sortLines(lines: LineGroup[]): LineGroup[] {
  const rank = (brand: string) => {
    const index = CHIP_ORDER.indexOf(brand);
    return index === -1 ? CHIP_ORDER.length : index;
  };
  return [...lines].sort((a, b) => rank(a.brand) - rank(b.brand) || a.model.localeCompare(b.model, "ru"));
}

export function MiniApp({ products }: { products: Product[] }) {
  const [ready, setReady] = useState(false);
  const [initData, setInitData] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [topPad, setTopPad] = useState(56);
  const items = useCart((state) => state.items);
  const setQty = useCart((state) => state.setQty);
  const clear = useCart((state) => state.clear);

  useEffect(() => {
    const app = telegram();
    app?.ready();
    app?.expand();
    app?.setHeaderColor?.("#ffffff");
    app?.setBackgroundColor?.("#ffffff");
    const data = app?.initData ?? "";
    const userId = app?.initDataUnsafe?.user?.id;
    const inset = app?.contentSafeAreaInset?.top || app?.safeAreaInset?.top || 0;
    setTopPad(Math.max(inset + 12, 64));
    setInitData(data);
    if (userId && ADMIN_IDS.includes(userId)) setIsAdmin(true);
    if (useCart.persist.hasHydrated()) setReady(true);
    else useCart.persist.onFinishHydration(() => setReady(true));
    if (!data) return;
    void telegramWho({ data: { initData: data } }).then((who) => {
      if (who.isAdmin) setIsAdmin(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) return;
    useCart.getState().reconcile(products);
  }, [products, ready]);

  const count = ready ? cartCount(items) : 0;
  const total = ready ? cartTotal(items) : 0;

  if (adminOpen && isAdmin) {
    return <AdminScreen initData={initData} topPad={topPad} onClose={() => setAdminOpen(false)} />;
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-line bg-white" style={{ paddingTop: topPad }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <a href="#catalog" className="flex min-w-0 items-center gap-2 text-ink">
            <img src="/brand/mark.png" alt="" className="h-10 w-auto shrink-0" />
            <span className="truncate font-display text-2xl leading-none">Mr.Puff</span>
          </a>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <button type="button" className={buttonClass.ghost} onClick={() => setAdminOpen(true)}>
                Админ
              </button>
            ) : null}
            <button type="button" className={buttonClass.ghost} onClick={() => setCartOpen(true)}>
              <ShoppingBag className="size-4" />
              <span className="tabular-nums">{count}</span>
            </button>
          </div>
        </div>
      </header>
      <Catalog products={products} />
      {ready && count > 0 && !cartOpen ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3">
          <button type="button" className={cn(buttonClass.primary, "w-full")} onClick={() => setCartOpen(true)}>
            Корзина · {count} · {formatPrice(total)}
          </button>
        </div>
      ) : null}
      <CartSheet
        open={cartOpen}
        items={ready ? items : []}
        total={total}
        initData={initData}
        onClose={() => setCartOpen(false)}
        onQty={setQty}
        onClear={clear}
      />
    </div>
  );
}

function Catalog({ products }: { products: Product[] }) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const brands = useMemo(() => {
    const set = new Set(products.map((product) => product.brand));
    const head = CHIP_ORDER.filter((item) => set.has(item));
    const rest = [...set].filter((item) => !CHIP_ORDER.includes(item)).sort((a, b) => a.localeCompare(b, "ru"));
    return [...head, ...rest];
  }, [products]);
  const lines = useMemo(() => {
    const tokens = query.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
    return sortLines(groupLines(products)).filter((line) => {
      if (brand && line.brand !== brand) return false;
      if (tokens.length === 0) return true;
      const hay = `${line.brand} ${line.model} ${line.items.map((item) => item.flavor).join(" ")}`.toLocaleLowerCase("ru");
      return tokens.every((token) => hay.includes(token));
    });
  }, [products, query, brand]);
  const allLines = useMemo(() => groupLines(products), [products]);
  const openLine = allLines.find((line) => line.key === openKey) ?? null;

  return (
    <section id="catalog" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-6 pb-28">
      <h1 className="font-display text-display text-ink">Каталог</h1>
      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip pressed={brand === null} onClick={() => setBrand(null)}>Все</Chip>
        {brands.map((item) => (
          <Chip key={item} pressed={brand === item} onClick={() => setBrand(brand === item ? null : item)}>
            {item}
          </Chip>
        ))}
      </div>
      <label className="relative mt-4 block">
        <span className="sr-only">Поиск</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-mist" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Бренд, модель или вкус"
          className={cn(fieldClass, "rounded-full pr-12 pl-11")}
        />
      </label>
      {lines.length === 0 ? (
        <p className="mt-8 text-center text-mist">Ничего не найдено</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
          {lines.map((line) => (
            <LineCard key={line.key} line={line} onOpen={() => setOpenKey(line.key)} />
          ))}
        </div>
      )}
      {openLine ? (
        <LinePicker
          line={openLine}
          siblings={allLines.filter((item) => item.brand === openLine.brand)}
          onClose={() => setOpenKey(null)}
          onSwitch={setOpenKey}
        />
      ) : null}
    </section>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm",
        pressed ? "btn-grad border-transparent text-white" : "border-line bg-white text-ink",
      )}
    >
      {children}
    </button>
  );
}

function LineCard({ line, onOpen }: { line: LineGroup; onOpen: () => void }) {
  const sample = line.items[0];
  return (
    <article className="flex h-full flex-col rounded-xl border border-line bg-white p-2">
      <button type="button" className="text-left" onClick={onOpen}>
        <div className="relative h-28 overflow-hidden rounded-md bg-white">
          {sample?.imageUrl ? (
            <img src={photoSrc(sample.imageUrl)} alt="" className="h-full w-full object-contain" />
          ) : (
            <DeviceArt brand={line.brand} />
          )}
        </div>
        <p className="mt-2 truncate text-xs font-medium tracking-widest text-mist uppercase">{line.brand}</p>
        <h2 className="mt-1 text-sm font-medium text-ink">{line.model}</h2>
        <p className="mt-1 text-sm font-medium tabular-nums">{formatPrice(line.price)}</p>
      </button>
      <Button className="mt-3 h-10 w-full" onClick={onOpen}>Выбрать</Button>
    </article>
  );
}

function LinePicker({
  line,
  siblings,
  onClose,
  onSwitch,
}: {
  line: LineGroup;
  siblings: LineGroup[];
  onClose: () => void;
  onSwitch: (key: string) => void;
}) {
  const add = useCart((state) => state.add);
  const [flavorId, setFlavorId] = useState<number | null>(line.items[0]?.id ?? null);
  useEffect(() => setFlavorId(line.items[0]?.id ?? null), [line]);
  const selected = line.items.find((item) => item.id === flavorId) ?? null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40">
      <button type="button" className="absolute inset-0" aria-label="Закрыть" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-white">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs tracking-widest text-mist uppercase">{line.brand}</p>
            <h2 className="mt-1 font-display text-3xl text-ink">{line.model}</h2>
          </div>
          <button type="button" className="grid size-11 place-items-center" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-sm text-mist">Линейка</p>
          <div className="mt-2 grid gap-2">
            {siblings.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSwitch(item.key)}
                className={cn(
                  "flex min-h-11 items-center justify-between rounded-lg border px-4 text-left text-sm",
                  item.key === line.key ? "btn-grad border-transparent text-white" : "border-line bg-white text-ink",
                )}
              >
                <span>{item.model}</span>
                <span className="tabular-nums">{formatPrice(item.price)}</span>
              </button>
            ))}
          </div>
          <p className="mt-5 text-sm text-mist">Вкус</p>
          <div className="mt-2 grid gap-2">
            {line.items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFlavorId(item.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-4 text-left text-sm",
                  item.id === flavorId ? "btn-grad border-transparent text-white" : "border-line bg-white text-ink",
                )}
              >
                {item.flavor}
              </button>
            ))}
          </div>
        </div>
        <div className="safe-bottom border-t border-line px-5 py-4">
          <Button
            className="w-full"
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              add(selected);
              onClose();
            }}
          >
            В корзину
          </Button>
        </div>
      </div>
    </div>
  );
}

function CartSheet({
  open,
  items,
  total,
  initData,
  onClose,
  onQty,
  onClear,
}: {
  open: boolean;
  items: CartLine[];
  total: number;
  initData: string;
  onClose: () => void;
  onQty: (id: number, qty: number) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ id: number; total: number } | null>(null);
  if (!open) return null;
  const digits = phone.replace(/\D/g, "");
  const canOrder = digits.length === 11 && address.trim().length >= 3 && name.trim().length >= 2 && Boolean(initData);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!canOrder) return;
    setPending(true);
    setError("");
    try {
      const result = await placeTelegramOrder({
        data: {
          initData,
          name,
          phone,
          address,
          comment,
          items: items.map((item) => ({ productId: item.productId, qty: item.qty })),
        },
      });
      setDone({ id: result.id, total: result.total });
      onClear();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40">
      <button type="button" className="absolute inset-0" aria-label="Закрыть" onClick={onClose} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-3xl text-ink">Корзина</h2>
          <button type="button" className="grid size-11 place-items-center" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {done ? (
            <div>
              <p className="font-display text-4xl text-ink">Заявка отправлена</p>
              <p className="mt-3 text-mist">Номер {done.id}. Сумма {formatPrice(done.total)}. Администратор получил её в Telegram.</p>
              <Button className="mt-8 w-full" onClick={onClose}>Закрыть</Button>
            </div>
          ) : items.length === 0 ? (
            <p className="text-mist">Корзина пуста</p>
          ) : (
            <form id="tg-order" className="grid gap-5" onSubmit={submit}>
              {items.map((line) => (
                <div key={line.productId} className="flex items-center justify-between gap-3 border-b border-line pb-3">
                  <div className="min-w-0">
                    <p className="text-xs tracking-widest text-mist uppercase">{line.brand}</p>
                    <p className="text-sm text-ink">{line.model}</p>
                    <p className="font-medium">{line.flavor}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="grid size-9 place-items-center rounded-full border border-line" onClick={() => onQty(line.productId, line.qty - 1)}>
                      <Minus className="size-4" />
                    </button>
                    <span className="w-5 text-center tabular-nums">{line.qty}</span>
                    <button type="button" className="grid size-9 place-items-center rounded-full border border-line" onClick={() => onQty(line.productId, line.qty + 1)}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>
              ))}
              <label className="grid gap-2 text-sm text-mist">
                Имя
                <input required value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Телефон
                <input required inputMode="tel" maxLength={18} value={phone} onChange={(event) => setPhone(applyPhone(event.target.value, phone))} className={fieldClass} placeholder="+7" />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Адрес
                <input required value={address} onChange={(event) => setAddress(event.target.value)} className={fieldClass} placeholder="улица, дом, подъезд" />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Комментарий
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={500} className={cn(fieldClass, "h-auto py-3")} />
              </label>
              {!initData ? <p className="text-sm text-danger">Откройте магазин из бота, иначе заказ не уйдёт.</p> : null}
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </form>
          )}
        </div>
        {!done && items.length > 0 ? (
          <div className="safe-bottom border-t border-line px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-mist">Сумма</span>
              <span className="text-lg font-medium tabular-nums">{formatPrice(total)}</span>
            </div>
            <button type="submit" form="tg-order" className={cn(buttonClass.primary, "w-full")} disabled={pending || !canOrder}>
              {pending ? "Отправка…" : "Оформить заказ"}
            </button>
            <p className="mt-2 text-center text-sm text-mist">Оплата только наличными</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function AdminScreen({ initData, topPad, onClose }: { initData: string; topPad: number; onClose: () => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof telegramAdmin>> | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<{
    id: number | null;
    brand: string;
    model: string;
    flavor: string;
    flavorTypes: FlavorTag[];
    price: string;
    imageUrl: string | null;
    active: boolean;
  } | null>(null);
  const [tab, setTab] = useState<"products" | "orders" | "notify" | null>(null);

  async function reload() {
    const next = await telegramAdmin({ data: { initData } });
    setData(next);
  }

  useEffect(() => {
    setTab(null);
    setDraft(null);
    void reload().catch((err) => setError(messageOf(err)));
  }, [initData]);

  async function notify() {
    if (text.trim().length < 2) return;
    if (!window.confirm("Отправить уведомление всем, кто заказывал в Mini App?")) return;
    setPending(true);
    setError("");
    setInfo("");
    try {
      const result = await sendRestock({ data: { initData, text } });
      setInfo(`Отправлено: ${result.sent}${result.failed ? `, не доставлено: ${result.failed}` : ""}`);
      setText("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  async function saveProduct(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setPending(true);
    setError("");
    try {
      await telegramSaveProduct({
        data: {
          initData,
          id: draft.id,
          brand: draft.brand,
          model: draft.model,
          flavor: draft.flavor,
          flavorTypes: draft.flavorTypes,
          price: Number(draft.price),
          imageUrl: draft.imageUrl,
          active: draft.active,
        },
      });
      setDraft(null);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  async function removeProduct(id: number) {
    if (!window.confirm("Удалить товар?")) return;
    setError("");
    try {
      await telegramDeleteProduct({ data: { initData, id } });
      await reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !draft) return;
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("initData", initData);
      if (draft.id) body.set("productId", String(draft.id));
      const result = await telegramUploadImage({ data: body });
      setDraft({ ...draft, imageUrl: result.imageUrl });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  function blank() {
    setDraft({ id: null, brand: "", model: "", flavor: "", flavorTypes: [], price: "", imageUrl: null, active: true });
  }

  function edit(product: Product) {
    setDraft({
      id: product.id,
      brand: product.brand,
      model: product.model,
      flavor: product.flavor,
      flavorTypes: product.flavorTypes,
      price: String(product.price),
      imageUrl: product.imageUrl,
      active: product.active,
    });
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-40 border-b border-line bg-white" style={{ paddingTop: topPad }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <button type="button" className="text-sm text-ink" onClick={onClose}>
            Назад
          </button>
          <h1 className="font-display text-2xl text-ink">Админ</h1>
          <button type="button" className="grid size-11 place-items-center" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
      </header>
      <div className="safe-bottom mx-auto max-w-lg px-5 py-4">
        <div className="flex gap-2 overflow-x-auto pb-4">
          {(
            [
              ["products", "Товары"],
              ["orders", "Заявки"],
              ["notify", "Уведомление"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setTab(id);
                setDraft(null);
              }}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm",
                tab === id ? "btn-grad border-transparent text-white" : "border-line bg-white text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {error ? <p className="mb-3 text-sm text-danger">{error}</p> : null}
        {tab === null ? <p className="text-mist">Выберите раздел</p> : null}
          {tab === "notify" ? (
            <div>
              <p className="text-sm text-mist">Только вручную. Получатели: {data?.audience ?? 0}, кто уже заказывал в Mini App.</p>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Текст уведомления"
                rows={5}
                maxLength={500}
                className={cn(fieldClass, "mt-3 h-auto py-3")}
              />
              <Button className="mt-3 w-full" disabled={text.trim().length < 2 || pending} onClick={notify}>
                {pending ? "Отправка…" : "Отправить уведомление"}
              </Button>
              {info ? <p className="mt-3 text-sm text-ink">{info}</p> : null}
            </div>
          ) : null}
          {tab === "products" && !draft ? (
            <div className="grid gap-3">
              <Button onClick={blank}>Добавить товар</Button>
              {data?.products.map((product) => (
                <article key={product.id} className="rounded-lg border border-line p-3 text-sm">
                  <p className="font-medium">{product.brand} {product.model}</p>
                  <p className="text-mist">{product.flavor} · {formatPrice(product.price)}{product.active ? "" : " · скрыт"}</p>
                  <div className="mt-2 flex gap-2">
                    <Button variant="ghost" className="h-10" onClick={() => edit(product)}>Править</Button>
                    <Button variant="danger" className="h-10" onClick={() => void removeProduct(product.id)}>Удалить</Button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
          {tab === "products" && draft ? (
            <form className="grid gap-4" onSubmit={saveProduct}>
              <h3 className="font-display text-3xl text-ink">{draft.id ? "Редактирование" : "Новый товар"}</h3>
              <label className="grid gap-2 text-sm text-mist">
                Бренд
                <input required value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} className={fieldClass} />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Модель
                <input required value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} className={fieldClass} />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Вкус
                <input required value={draft.flavor} onChange={(event) => setDraft({ ...draft, flavor: event.target.value })} className={fieldClass} />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Цена, ₸
                <input
                  required
                  inputMode="numeric"
                  value={draft.price}
                  onChange={(event) => setDraft({ ...draft, price: event.target.value.replace(/\D/g, "") })}
                  className={fieldClass}
                />
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                  className="size-5 accent-tide"
                />
                В продаже
              </label>
              <fieldset>
                <legend className="mb-2 text-sm text-mist">Тип вкуса</legend>
                <div className="flex flex-wrap gap-2">
                  {FLAVOR_TAGS.map((tag) => {
                    const on = draft.flavorTypes.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={on}
                        className={cn(
                          "inline-flex min-h-11 items-center rounded-full border px-4 text-sm",
                          on ? "btn-grad border-transparent text-white" : "border-line bg-white text-ink",
                        )}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            flavorTypes: on
                              ? draft.flavorTypes.filter((item) => item !== tag.id)
                              : [...draft.flavorTypes, tag.id],
                          })
                        }
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <div className="flex items-center gap-4">
                <div className="h-24 w-16 overflow-hidden rounded-sm bg-white">
                  {draft.imageUrl ? <img src={draft.imageUrl} alt="" className="h-full w-full object-contain" /> : <DeviceArt brand={draft.brand || "PLONQ"} />}
                </div>
                <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm text-ink">
                  {pending ? "Загрузка…" : "Загрузить фото"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    onChange={(event) => void onFile(event.target.files?.[0])}
                  />
                </label>
              </div>
              <Button type="submit" disabled={pending}>Сохранить</Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Отмена</Button>
            </form>
          ) : null}
          {tab === "orders" ? (
            <div className="grid gap-3">
              {data?.orders.map((order) => (
                <article key={order.id} className="rounded-lg border border-line p-3 text-sm">
                  <p className="font-medium">#{order.id} · {order.customerName} · {formatPrice(order.total)}</p>
                  <p className="text-mist">{order.phone} · {order.source === "telegram" ? "Telegram" : "Сайт"} · {formatWhen(order.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-mist">{order.comment}</p>
                </article>
              ))}
            </div>
          ) : null}
      </div>
    </div>
  );
}
