import { buildVisibleProductName } from "app/lib/product-url";
import { trimSeoDescription } from "app/lib/seo-metadata";

const clean = (value?: string) => (value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const contains = (text: string, value: string) => {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
};
const short = (value: string, length: number) => {
  if (value.length <= length) return value;
  const slice = value.slice(0, length);
  const boundary = slice.lastIndexOf(" ");
  // Supplier abbreviations (ручн., гальм.) are not sentence endings.
  const end = boundary >= length * 0.65 ? boundary : length - 1;
  return `${slice.slice(0, end).replace(/[\s,;:]+$/u, "")}…`;
};

type ProductIdentity = { productName?: string; producer?: string; article?: string; category?: string; group?: string; subGroup?: string };

export function buildProductSeoTitle({ name, producer, article }: { name: string; producer?: string; article?: string }) {
  const label = clean(buildVisibleProductName(name));
  const maker = clean(producer);
  const code = clean(article);
  const identity = [maker && !contains(label, maker) ? short(maker, 18) : "", code && !contains(label, code) ? short(code, 24) : ""].filter(Boolean).join(" ");
  const suffix = `${identity ? ` — ${identity}` : ""} | PartsON`;
  // Keep the part type readable and its real article distinguishable. The
  // character budget is editorial; Google truncates by rendered width.
  return `${short(label || "Автозапчастина", Math.max(20, 65 - suffix.length))}${suffix}`;
}

export function buildProductMetaDescription(options: ProductIdentity) {
  const name = clean(buildVisibleProductName(options.productName || options.subGroup || options.group || options.category || "Автозапчастина"));
  const identity = [clean(options.producer), clean(options.article)]
    .filter(value => value && !contains(name, value)).join(" ");
  const lead = `${short(name, 66)}${identity ? ` ${short(identity, 36)}` : ""}`;
  // The product name retains actual fitment/model information. Do not turn
  // a supplier's category into an unverified compatibility or stock claim.
  return trimSeoDescription(`${lead} — ціна й наявність у PartsON. Підбір за VIN, самовивіз у Львові та доставка по Україні.`);
}

export function buildProductImageAlt(options: ProductIdentity) {
  const name = clean(buildVisibleProductName(options.productName || "Автозапчастина"));
  const identity = [clean(options.producer), clean(options.article)].filter(value => value && !contains(name, value));
  return [name, ...identity].join(" — ");
}
