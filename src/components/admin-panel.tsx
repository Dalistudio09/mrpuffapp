import { useMemo, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Button, fieldClass } from "@/components/button";
import { DeviceArt } from "@/components/device-art";
import { cn } from "@/lib/cn";
import { FLAVOR_TAGS, type AdminState, type FlavorTag, type Product } from "@/lib/types";
import { inferFlavorTags, lineKey } from "@/lib/flavors";
import { formatPrice, formatWhen } from "@/lib/format";
import {
  adminLogin,
  adminLogout,
  deleteProduct,
  saveProduct,
  saveWhatsapp,
  setProductActive,
  uploadProductImage,
} from "@/lib/shop.functions";

type Tab = "products" | "orders" | "settings";

type Draft = {
  id: number | null;
  brand: string;
  model: string;
  flavor: string;
  flavorTypes: FlavorTag[];
  price: string;
  imageUrl: string | null;
  active: boolean;
};

const emptyDraft = (): Draft => ({
  id: null,
  brand: "",
  model: "",
  flavor: "",
  flavorTypes: [],
  price: "",
  imageUrl: null,
  active: true,
});

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : "Не получилось выполнить действие";
}

export function AdminPanel({ initial }: { initial: AdminState }) {
  const [state, setState] = useState(initial);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      setState(await adminLogin({ data: { password } }));
      setPassword("");
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setPending(false);
    }
  }

  if (!state.authed) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
        <p className="text-xs font-medium tracking-widest text-mist uppercase">Служебный вход</p>
        <h1 className="mt-4 font-display text-6xl text-ink italic">Mr.Puff</h1>
        <form className="mt-10 grid gap-4" onSubmit={login}>
          <label className="grid gap-2 text-sm text-mist">
            Пароль
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
          {state.previewHint ? (
            <p className="text-sm text-mist">
              В превью пароль: <span className="text-ink">{state.previewHint}</span>. Позже его можно сменить через ADMIN_PASSWORD.
            </p>
          ) : null}
          {!state.passwordReady ? (
            <p className="text-sm text-mist">Задайте ADMIN_PASSWORD в настройках публикации — без этого вход закрыт.</p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Проверка…" : "Войти"}
          </Button>
        </form>
        <Link to="/" className="mt-8 text-sm text-mist underline-offset-4 hover:text-ink hover:underline">
          На витрину
        </Link>
      </main>
    );
  }

  return <Dashboard state={state} setState={setState} />;
}

function Dashboard({
  state,
  setState,
}: {
  state: AdminState;
  setState: (state: AdminState) => void;
}) {
  const [tab, setTab] = useState<Tab>("products");
  const [error, setError] = useState("");

  async function run(action: () => Promise<AdminState>) {
    setError("");
    try {
      setState(await action());
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-medium tracking-widest text-mist uppercase">Админ</p>
          <h1 className="mt-2 font-display text-5xl text-ink italic">Mr.Puff</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/" className="inline-flex h-11 items-center text-sm text-mist underline-offset-4 hover:text-ink hover:underline">
            Витрина
          </Link>
          <Button
            variant="ghost"
            onClick={() =>
              run(async () => {
                return adminLogout();
              })
            }
          >
            Выйти
          </Button>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {(
          [
            ["products", "Товары"],
            ["orders", "Заказы"],
            ["settings", "WhatsApp"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            className={cn(
              "inline-flex h-11 items-center rounded-full border px-4 text-sm",
              tab === id ? "border-tide bg-tide text-canvas" : "border-line text-ink",
            )}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "orders" ? <span className="ml-2 tabular-nums">{state.orders.length}</span> : null}
          </button>
        ))}
      </div>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      <div className="mt-8">
        {tab === "products" ? <Products state={state} setState={setState} onError={setError} /> : null}
        {tab === "orders" ? <Orders state={state} /> : null}
        {tab === "settings" ? <Settings state={state} setState={setState} /> : null}
      </div>
    </main>
  );
}

function Products({
  state,
  setState,
  onError,
}: {
  state: AdminState;
  setState: (state: AdminState) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const groups = useMemo(() => {
    const tokens = query.toLocaleLowerCase("ru").split(/\s+/).filter(Boolean);
    const visible = state.products.filter((product) => {
      if (tokens.length === 0) return true;
      const hay = `${product.brand} ${product.model} ${product.flavor}`.toLocaleLowerCase("ru");
      return tokens.every((token) => hay.includes(token));
    });
    const map = new Map<string, Product[]>();
    for (const product of visible) {
      const key = lineKey(product.brand, product.model);
      const list = map.get(key) ?? [];
      list.push(product);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [state.products, query]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    onError("");
    try {
      const price = Number(draft.price);
      setState(
        await saveProduct({
          data: {
            id: draft.id,
            brand: draft.brand,
            model: draft.model,
            flavor: draft.flavor,
            flavorTypes: draft.flavorTypes,
            price,
            imageUrl: draft.imageUrl,
            active: draft.active,
          },
        }),
      );
      setDraft(null);
    } catch (err) {
      onError(messageOf(err));
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !draft) return;
    if (file.size > 3_500_000) {
      onError("Фото должно быть меньше 3.5 МБ");
      return;
    }
    onError("");
    setUploading(true);
    try {
      const body = new FormData();
      body.set("file", file);
      if (draft.id) body.set("productId", String(draft.id));
      const result = await uploadProductImage({ data: body });
      setDraft({ ...draft, imageUrl: result.imageUrl });
      if (draft.id) {
        setState({
          ...state,
          products: state.products.map((product) =>
            product.id === draft.id ? { ...product, imageUrl: result.imageUrl } : product,
          ),
        });
      }
    } catch (err) {
      onError(messageOf(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти товар"
          className={cn(fieldClass, "max-w-sm")}
        />
        <Button
          onClick={() => {
            setDraft(emptyDraft());
            onError("");
          }}
        >
          Добавить товар
        </Button>
      </div>
      {!state.cloudinary ? (
        <p className="text-sm text-mist">
          Загрузка фото включится после CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY и CLOUDINARY_API_SECRET. В базе хранится только ссылка.
        </p>
      ) : null}

      {draft ? (
        <form className="grid gap-4 rounded-xl border border-line bg-panel p-4 md:p-6" onSubmit={save}>
          <h2 className="font-display text-3xl text-ink italic">{draft.id ? "Редактирование" : "Новый товар"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm text-mist">
              Бренд
              <input required value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} className={fieldClass} />
            </label>
            <label className="grid gap-2 text-sm text-mist">
              Модель
              <input required value={draft.model} onChange={(event) => setDraft({ ...draft, model: event.target.value })} className={fieldClass} />
            </label>
            <label className="grid gap-2 text-sm text-mist md:col-span-2">
              Вкус
              <input
                required
                value={draft.flavor}
                onChange={(event) => setDraft({ ...draft, flavor: event.target.value })}
                onBlur={() => {
                  if (draft.flavorTypes.length === 0 && draft.flavor.trim()) {
                    setDraft({ ...draft, flavorTypes: inferFlavorTags(draft.flavor) });
                  }
                }}
                className={fieldClass}
              />
            </label>
            <label className="grid gap-2 text-sm text-mist">
              Цена, ₸
              <input required inputMode="numeric" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value.replace(/\D/g, "") })} className={fieldClass} />
            </label>
            <label className="flex items-end gap-3 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                className="size-5 accent-tide"
              />
              В продаже
            </label>
          </div>
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
                      on ? "border-tide bg-tide text-canvas" : "border-line text-ink",
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
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-24 w-16 overflow-hidden rounded-sm bg-canvas">
              {draft.imageUrl ? (
                <img src={draft.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <DeviceArt brand={draft.brand || "PLONQ"} />
              )}
            </div>
            <label className="inline-flex h-11 cursor-pointer items-center rounded-full border border-line px-4 text-sm text-ink">
              {uploading ? "Загрузка…" : "Загрузить фото"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void onFile(file);
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit">Сохранить</Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Отмена
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-8">
        {groups.map(([key, products]) => {
          const first = products[0];
          if (!first) return null;
          return (
            <section key={key}>
              <h2 className="text-sm font-medium tracking-widest text-mist uppercase">
                {first.brand} · {first.model}
              </h2>
              <ul className="mt-3 grid gap-3">
                {products.map((product) => (
                  <li key={product.id} className="rounded-xl border border-line bg-panel p-3">
                    <div className="flex gap-3">
                      <div className="h-20 w-14 shrink-0 overflow-hidden rounded-sm bg-canvas">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <DeviceArt brand={product.brand} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink">{product.flavor}</p>
                        <p className="mt-1 text-sm text-tide tabular-nums">{formatPrice(product.price)}</p>
                        <p className="mt-1 text-xs text-mist">{product.active ? "В продаже" : "Скрыт"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setDraft({
                            id: product.id,
                            brand: product.brand,
                            model: product.model,
                            flavor: product.flavor,
                            flavorTypes: product.flavorTypes,
                            price: String(product.price),
                            imageUrl: product.imageUrl,
                            active: product.active,
                          })
                        }
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={async () => {
                          onError("");
                          try {
                            setState(await setProductActive({ data: { id: product.id, active: !product.active } }));
                          } catch (err) {
                            onError(messageOf(err));
                          }
                        }}
                      >
                        {product.active ? "Скрыть" : "Показать"}
                      </Button>
                      {confirmId === product.id ? (
                        <>
                          <Button
                            variant="danger"
                            onClick={async () => {
                              onError("");
                              try {
                                setState(await deleteProduct({ data: { id: product.id } }));
                                setConfirmId(null);
                              } catch (err) {
                                onError(messageOf(err));
                              }
                            }}
                          >
                            Удалить
                          </Button>
                          <Button variant="ghost" onClick={() => setConfirmId(null)}>
                            Отмена
                          </Button>
                        </>
                      ) : (
                        <Button variant="danger" onClick={() => setConfirmId(product.id)}>
                          Удалить
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Orders({ state }: { state: AdminState }) {
  if (state.orders.length === 0) {
    return <p className="text-mist">Заявок пока нет.</p>;
  }
  return (
    <ul className="grid gap-4">
      {state.orders.map((order) => (
        <li key={order.id} className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium text-ink">#{order.id} · {order.customerName}</p>
            <p className="text-sm text-mist">{formatWhen(order.createdAt)}</p>
          </div>
          <p className="mt-1 text-sm text-mist">{order.phone}</p>
          {order.comment ? <p className="mt-2 text-sm text-ink">{order.comment}</p> : null}
          <ul className="mt-3 grid gap-1 text-sm text-mist">
            {order.items.map((item, index) => (
              <li key={`${order.id}-${item.productId}-${index}`}>
                {item.brand} {item.model} — {item.flavor} × {item.qty}
              </li>
            ))}
          </ul>
          <p className="mt-3 font-medium text-tide tabular-nums">{formatPrice(order.total)}</p>
        </li>
      ))}
    </ul>
  );
}

function Settings({
  state,
  setState,
}: {
  state: AdminState;
  setState: (state: AdminState) => void;
}) {
  const [phone, setPhone] = useState(state.whatsappPhone);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    try {
      setState(await saveWhatsapp({ data: { phone } }));
      setSaved(true);
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <form className="grid max-w-md gap-4" onSubmit={save}>
      <p className="text-sm text-mist">Номер, на который откроется WhatsApp при оформлении. Пока пусто — заявка сохранится, а WhatsApp откроется без заранее выбранного чата.</p>
      <label className="grid gap-2 text-sm text-mist">
        Номер WhatsApp
        <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="7XXXXXXXXXX" className={fieldClass} />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? <p className="text-sm text-tide">Сохранено</p> : null}
      <Button type="submit">Сохранить</Button>
    </form>
  );
}
