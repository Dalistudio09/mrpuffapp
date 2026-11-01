export const FLAVOR_TAGS = [
  { id: "berries", label: "Ягоды" },
  { id: "mint", label: "Мята/ментол" },
  { id: "fruit", label: "Фрукты" },
  { id: "soda", label: "Газировка" },
  { id: "sweet", label: "Сладкое" },
  { id: "other", label: "Другое" },
] as const;

export type FlavorTag = (typeof FLAVOR_TAGS)[number]["id"];

export type Product = {
  id: number;
  brand: string;
  model: string;
  flavor: string;
  flavorTypes: FlavorTag[];
  price: number;
  imageUrl: string | null;
  active: boolean;
};

export type OrderItem = {
  productId: number;
  brand: string;
  model: string;
  flavor: string;
  price: number;
  qty: number;
};

export type ShopOrder = {
  id: number;
  customerName: string;
  phone: string;
  comment: string;
  total: number;
  items: OrderItem[];
  createdAt: string;
};

export type AdminState = {
  authed: boolean;
  passwordReady: boolean;
  previewHint: string | null;
  cloudinary: boolean;
  whatsappPhone: string;
  products: Product[];
  orders: ShopOrder[];
};

export type StorefrontData = {
  products: Product[];
  whatsappPhone: string;
};
