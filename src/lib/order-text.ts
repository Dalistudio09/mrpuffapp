import { formatPrice, waDigits } from "@/lib/format";
import type { OrderItem } from "@/lib/types";

export function buildOrderMessage(input: {
  name: string;
  phone: string;
  address: string;
  comment: string;
  items: OrderItem[];
  total: number;
}): string {
  const lines = [
    "Заказ Mr.Puff",
    `Имя: ${input.name}`,
    `Телефон: ${input.phone}`,
    `Адрес: ${input.address}`,
  ];
  if (input.comment) lines.push(`Комментарий: ${input.comment}`);
  lines.push("");
  for (const item of input.items) {
    lines.push(
      `• ${item.brand} ${item.model} — ${item.flavor} × ${item.qty} — ${formatPrice(item.price * item.qty)}`,
    );
  }
  lines.push("");
  lines.push(`Итого: ${formatPrice(input.total)}`);
  lines.push("Оплата только наличными");
  return lines.join("\n");
}

export function whatsappHref(phone: string, text?: string): string {
  const digits = waDigits(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  if (!digits) return `https://wa.me/${query}`;
  return `https://wa.me/${digits}${query}`;
}
