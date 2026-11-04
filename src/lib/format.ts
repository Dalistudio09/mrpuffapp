const priceFormat = new Intl.NumberFormat("ru-KZ");

export function formatPrice(value: number): string {
  return `${priceFormat.format(value)} ₸`;
}

const dateFormat = new Intl.DateTimeFormat("ru-KZ", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Almaty",
});

export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFormat.format(date);
}

export function waDigits(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}
