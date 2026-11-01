import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Minus, Plus, Search, ShoppingBag, X } from "lucide-react";
import { Button, buttonClass, fieldClass } from "@/components/button";
import { DeviceArt } from "@/components/device-art";
import { cn } from "@/lib/cn";
import { cartCount, cartTotal, useCart, type CartLine } from "@/lib/cart-store";
import { lineKey } from "@/lib/flavors";
import { formatPrice } from "@/lib/format";
import { placeOrder } from "@/lib/shop.functions";
import type { Product } from "@/lib/types";

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
  if (nextRaw.length < previous.length && digits.length === prevDigits.length) {
    digits = digits.slice(0, -1);
  }
  return formatPhone(digits.slice(0, 11));
}

function photoSrc(url: string): string {
  return url.startsWith("/catalog/") ? `${url}?v=5` : url;
}

function useCartReady() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (useCart.persist.hasHydrated()) {
      setReady(true);
      return;
    }
    return useCart.persist.onFinishHydration(() => setReady(true));
  }, []);
  return ready;
}

function ProductPhoto({ product }: { product: Product }) {
  const [broken, setBroken] = useState(false);
  if (!product.imageUrl || broken) return <DeviceArt brand={product.brand} />;
  return (
    <img
      src={photoSrc(product.imageUrl)}
      alt={`${product.brand} ${product.model}, ${product.flavor}`}
      className="h-full w-full object-contain motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105"
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

function QtyControl({
  qty,
  onChange,
  dense = false,
}: {
  qty: number;
  onChange: (qty: number) => void;
  dense?: boolean;
}) {
  const size = dense ? "h-9 w-9" : "h-11 w-11";
  return (
    <div className={cn("inline-flex items-center rounded-full border border-line", dense ? "h-9" : "h-11")}>
      <button type="button" className={cn("grid place-items-center", size)} onClick={() => onChange(qty - 1)} aria-label="Меньше">
        <Minus className="size-4" />
      </button>
      <span className="min-w-5 text-center text-sm tabular-nums">{qty}</span>
      <button type="button" className={cn("grid place-items-center", size)} onClick={() => onChange(qty + 1)} aria-label="Больше">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

export function Storefront({
  products,
}: {
  products: Product[];
  whatsappPhone?: string;
}) {
  const ready = useCartReady();
  const items = useCart((state) => state.items);
  const setQty = useCart((state) => state.setQty);
  const clear = useCart((state) => state.clear);
  const [cartOpen, setCartOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    useCart.getState().reconcile(products);
  }, [products, ready]);

  const count = ready ? cartCount(items) : 0;
  const total = ready ? cartTotal(items) : 0;

  return (
    <div className="min-h-screen">
      <Header count={count} onCart={() => setCartOpen(true)} />
      <Catalog products={products} />
      <Footer />
      {ready && count > 0 && !cartOpen ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white p-3 md:hidden">
          <button type="button" className={cn(buttonClass.primary, "w-full")} onClick={() => setCartOpen(true)}>
            Корзина · {count} · {formatPrice(total)}
          </button>
        </div>
      ) : null}
      <CartSheet
        open={cartOpen}
        items={ready ? items : []}
        onClose={() => setCartOpen(false)}
        onQty={setQty}
        onClear={clear}
      />
    </div>
  );
}

function Header({ count, onCart }: { count: number; onCart: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#catalog" className="flex min-w-0 items-center gap-2 text-ink">
          <img src="/brand/mark.png" alt="" className="h-10 w-auto shrink-0 sm:h-11" />
          <span className="truncate font-display text-2xl leading-none tracking-tight sm:text-[1.65rem]">Mr.Puff</span>
        </a>
        <div className="flex items-center gap-2">
          <span className="px-2 text-xs font-medium tracking-widest text-mist">18+</span>
          <button type="button" className={buttonClass.ghost} onClick={onCart}>
            <ShoppingBag className="size-4" />
            <span className="hidden sm:inline">Корзина</span>
            <span className="tabular-nums">{count}</span>
          </button>
        </div>
      </div>
    </header>
  );
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
    <section id="catalog" className="mx-auto max-w-6xl scroll-mt-20 px-5 pt-6 pb-24">
      <h2 className="font-display text-display text-ink">Каталог</h2>
      <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 pb-1">
        <Chip pressed={brand === null} onClick={() => setBrand(null)}>
          Все
        </Chip>
        {brands.map((item) => (
          <Chip key={item} pressed={brand === item} onClick={() => setBrand(brand === item ? null : item)}>
            {item}
          </Chip>
        ))}
      </div>
      <label className="relative mt-4 block">
        <span className="sr-only">Поиск по названию и вкусу</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-mist" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Бренд, модель или вкус"
          className={cn(fieldClass, "rounded-full pr-12 pl-11")}
        />
        {query ? (
          <button type="button" className="absolute top-1/2 right-2 grid size-11 -translate-y-1/2 place-items-center text-mist" onClick={() => setQuery("")} aria-label="Очистить поиск">
            <X className="size-4" />
          </button>
        ) : null}
      </label>
      {lines.length === 0 ? (
        <div className="mt-8 rounded-xl border border-line bg-white px-6 py-14 text-center">
          <p className="text-xl text-ink">Ничего не найдено</p>
          <Button variant="ghost" className="mt-6" onClick={() => { setQuery(""); setBrand(null); }}>
            Сбросить
          </Button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 md:gap-3 xl:grid-cols-4">
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

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
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
    <article className="flex h-full flex-col rounded-xl border border-line bg-white p-2 sm:p-3">
      <button type="button" className="text-left" onClick={onOpen}>
        <div className="relative h-28 overflow-hidden rounded-md bg-white sm:h-36">
          {sample ? <ProductPhoto product={sample} /> : null}
        </div>
        <p className="mt-2 truncate text-xs font-medium tracking-widest text-mist uppercase">{line.brand}</p>
        <h3 className="mt-1 text-sm font-medium text-ink sm:text-base">{line.model}</h3>
        <p className="mt-1 text-sm font-medium tabular-nums text-ink">{formatPrice(line.price)}</p>
      </button>
      <Button className="mt-3 h-10 w-full" onClick={onOpen}>
        Выбрать
      </Button>
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

  useEffect(() => {
    setFlavorId(line.items[0]?.id ?? null);
  }, [line]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const selected = line.items.find((item) => item.id === flavorId) ?? null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/40 sm:place-items-center">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрыть" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="line-title"
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl border border-line bg-white shadow-lift sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="text-xs font-medium tracking-widest text-mist uppercase">{line.brand}</p>
            <h2 id="line-title" className="mt-1 font-display text-3xl text-ink">{line.model}</h2>
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
                aria-pressed={item.key === line.key}
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
                aria-pressed={item.id === flavorId}
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
            В корзину{selected ? ` · ${formatPrice(selected.price)}` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}

function CartSheet({
  open,
  items,
  onClose,
  onQty,
  onClear,
}: {
  open: boolean;
  items: CartLine[];
  onClose: () => void;
  onQty: (productId: number, qty: number) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<{ id: number; total: number; whatsappUrl: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;
  const total = cartTotal(items);
  const phoneDigits = phone.replace(/\D/g, "");
  const canOrder = phoneDigits.length === 11 && address.trim().length >= 3;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (phone.replace(/\D/g, "").length !== 11 || address.trim().length < 3) return;
    setError("");
    const popup = window.open("about:blank", "_blank");
    setPending(true);
    try {
      const result = await placeOrder({
        data: {
          name,
          phone,
          address,
          comment,
          items: items.map((line) => ({ productId: line.productId, qty: line.qty })),
        },
      });
      if (popup) popup.location.href = result.whatsappUrl;
      setSuccess(result);
      onClear();
      setName("");
      setPhone("");
      setAddress("");
      setComment("");
    } catch (err) {
      popup?.close();
      setError(err instanceof Error ? err.message : "Не удалось отправить заявку");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Закрыть корзину" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-title"
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-panel shadow-lift"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="cart-title" className="font-display text-3xl text-ink">
            Корзина
          </h2>
          <button type="button" className="grid size-11 place-items-center" onClick={onClose} aria-label="Закрыть">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {success ? (
            <div>
              <p className="font-display text-4xl text-ink">Заявка отправлена</p>
              <p className="mt-3 text-mist">
                Номер {success.id}. Сумма {formatPrice(success.total)}.
              </p>
              <a href={success.whatsappUrl} target="_blank" rel="noreferrer" className={cn(buttonClass.primary, "mt-8")}>
                Открыть WhatsApp
              </a>
              <Button
                variant="ghost"
                className="mt-3 w-full"
                onClick={() => {
                  setSuccess(null);
                  onClose();
                }}
              >
                Закрыть
              </Button>
            </div>
          ) : items.length === 0 ? (
            <div>
              <p className="text-lg text-ink">Корзина пуста</p>
              <p className="mt-2 text-mist">Выберите вкус в каталоге.</p>
              <Button variant="ghost" className="mt-6" onClick={onClose}>
                К каталогу
              </Button>
            </div>
          ) : (
            <form id="order-form" className="grid gap-6" onSubmit={submit}>
              <ul className="grid gap-4">
                {items.map((line) => (
                  <li key={line.productId} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-line pb-4">
                    <div className="aspect-[3/4] overflow-hidden rounded-sm bg-canvas">
                      {line.imageUrl ? (
                        <img src={photoSrc(line.imageUrl)} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <DeviceArt brand={line.brand} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs tracking-widest text-mist uppercase">{line.brand}</p>
                      <p className="mt-1 text-sm text-mist">{line.model}</p>
                      <p className="mt-1 font-medium text-ink">{line.flavor}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <QtyControl qty={line.qty} onChange={(qty) => onQty(line.productId, qty)} />
                        <p className="text-sm tabular-nums text-tide">{formatPrice(line.price * line.qty)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <label className="grid gap-2 text-sm text-mist">
                Имя
                <input required autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Телефон
                <input
                  required
                  autoComplete="tel"
                  inputMode="tel"
                  maxLength={18}
                  value={phone}
                  onChange={(event) => setPhone(applyPhone(event.target.value, phone))}
                  className={fieldClass}
                  placeholder="+7"
                />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Адрес
                <input
                  required
                  autoComplete="street-address"
                  value={address}
                  maxLength={200}
                  onChange={(event) => setAddress(event.target.value)}
                  className={fieldClass}
                  placeholder="улица, дом, подъезд"
                />
              </label>
              <label className="grid gap-2 text-sm text-mist">
                Комментарий
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} maxLength={500} className={cn(fieldClass, "h-auto py-3")} />
              </label>
              {error ? <p className="text-sm text-danger">{error}</p> : null}
            </form>
          )}
        </div>
        {!success && items.length > 0 ? (
          <div className="safe-bottom border-t border-line px-5 py-4">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="text-mist">Сумма</span>
              <span className="text-lg font-medium text-ink tabular-nums">{formatPrice(total)}</span>
            </div>
            <button type="submit" form="order-form" className={cn(buttonClass.primary, "w-full")} disabled={pending || !canOrder}>
              {pending ? "Отправка…" : "Оформить в WhatsApp"}
            </button>
            <p className="mt-2 text-center text-sm text-mist">Оплата только наличными</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-14 pb-28">
        <div className="flex items-center gap-3">
          <img src="/brand/mark.png" alt="" className="h-12 w-auto" />
          <p className="font-display text-4xl text-ink">Mr.Puff</p>
        </div>
        <p className="mt-8 text-xs text-mist">18+. Продажа несовершеннолетним запрещена.</p>
        <Link to="/admin" className="mt-6 inline-flex min-h-11 items-center text-sm font-medium text-ink underline-offset-4 hover:underline">
          Админ
        </Link>
      </div>
    </footer>
  );
}
