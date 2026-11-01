import { FLAVOR_TAGS, type FlavorTag } from "@/lib/types";

export const BRAND_ORDER = ["PLONQ", "FASTA", "ELF BAR", "WAKA"] as const;

export const PRICE_PRESETS = [
  { id: "all", label: "Все цены", min: null, max: null },
  { id: "to12", label: "До 12 000 ₸", min: null, max: 12000 },
  { id: "mid", label: "12 000–13 500 ₸", min: 12000, max: 13500 },
  { id: "from135", label: "От 13 500 ₸", min: 13500, max: null },
] as const;

const TAG_SET = new Set<string>(FLAVOR_TAGS.map((tag) => tag.id));

export function isFlavorTag(value: string): value is FlavorTag {
  return TAG_SET.has(value);
}

export function flavorLabel(id: string): string {
  return FLAVOR_TAGS.find((tag) => tag.id === id)?.label ?? id;
}

export function lineKey(brand: string, model: string): string {
  return `${brand}|||${model}`;
}

export function orderedBrands(brands: string[]): string[] {
  const set = new Set(brands);
  const head = BRAND_ORDER.filter((brand) => set.has(brand));
  const rest = [...set]
    .filter((brand) => !BRAND_ORDER.includes(brand as (typeof BRAND_ORDER)[number]))
    .sort((a, b) => a.localeCompare(b, "ru"));
  return [...head, ...rest];
}

export function inferFlavorTags(flavor: string): FlavorTag[] {
  const n = flavor.toLocaleLowerCase("ru");
  const set = new Set<FlavorTag>();
  if (/ежевик|черник|клюкв|клубник|малин|ягод|смородин|вишн/.test(n)) set.add("berries");
  if (/мят|ментол/.test(n)) set.add("mint");
  if (/газировк|кола|лимонад/.test(n)) set.add("soda");
  if (/пирог|сладк|смузи|шот|fab/.test(n)) set.add("sweet");
  if (/энергетик|жасмин|сакура|fcuking|fab/.test(n)) set.add("other");
  if (/киви|лайм|ананас|лимон|яблок|виноград|арбуз|персик|помело|апельсин|груш|манго|маракуй|гуава|грейпфрут|питай|гранат/.test(n)) {
    set.add("fruit");
  }
  if (set.size === 0) set.add("other");
  return FLAVOR_TAGS.map((tag) => tag.id).filter((id) => set.has(id));
}
