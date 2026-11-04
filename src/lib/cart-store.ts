import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "@/lib/types";

export type CartLine = {
  productId: number;
  brand: string;
  model: string;
  flavor: string;
  price: number;
  imageUrl: string | null;
  qty: number;
};

type CartState = {
  items: CartLine[];
  add: (product: Product) => void;
  setQty: (productId: number, qty: number) => void;
  clear: () => void;
  reconcile: (products: Product[]) => void;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (product) => {
        const items = get().items;
        const index = items.findIndex((line) => line.productId === product.id);
        if (index === -1) {
          set({
            items: [
              ...items,
              {
                productId: product.id,
                brand: product.brand,
                model: product.model,
                flavor: product.flavor,
                price: product.price,
                imageUrl: product.imageUrl,
                qty: 1,
              },
            ],
          });
          return;
        }
        const next = items.slice();
        const current = next[index];
        if (!current) return;
        next[index] = {
          ...current,
          price: product.price,
          brand: product.brand,
          model: product.model,
          flavor: product.flavor,
          imageUrl: product.imageUrl,
          qty: Math.min(20, current.qty + 1),
        };
        set({ items: next });
      },
      setQty: (productId, qty) => {
        if (qty <= 0) {
          set({ items: get().items.filter((line) => line.productId !== productId) });
          return;
        }
        set({
          items: get().items.map((line) =>
            line.productId === productId ? { ...line, qty: Math.min(20, qty) } : line,
          ),
        });
      },
      clear: () => set({ items: [] }),
      reconcile: (products) => {
        const byId = new Map(products.filter((product) => product.active).map((product) => [product.id, product]));
        const prev = get().items;
        const items = prev.flatMap((line) => {
          const product = byId.get(line.productId);
          if (!product) return [];
          return [
            {
              ...line,
              brand: product.brand,
              model: product.model,
              flavor: product.flavor,
              price: product.price,
              imageUrl: product.imageUrl,
            },
          ];
        });
        const same =
          items.length === prev.length &&
          items.every((line, index) => {
            const old = prev[index];
            return (
              old &&
              old.productId === line.productId &&
              old.qty === line.qty &&
              old.price === line.price &&
              old.flavor === line.flavor &&
              old.imageUrl === line.imageUrl
            );
          });
        if (!same) set({ items });
      },
    }),
    { name: "mrpuff-cart" },
  ),
);

export function cartCount(items: CartLine[]): number {
  return items.reduce((sum, line) => sum + line.qty, 0);
}

export function cartTotal(items: CartLine[]): number {
  return items.reduce((sum, line) => sum + line.price * line.qty, 0);
}
