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

const SEO_TITLE_MAX_LENGTH = 65;

export function buildProductSeoTitle({ name, producer, article }: { name: string; producer?: string; article?: string }) {
  const label = clean(buildVisibleProductName(name)) || "Автозапчастина";
  const maker = clean(producer);
  const code = clean(article);
  const makerPart = maker && !contains(label, maker) ? short(maker, 18) : "";
  const codePart = code && !contains(label, code) ? short(code, 24) : "";
  const withIdentity = (...parts: string[]) => {
    const identity = parts.filter(Boolean).join(" ");
    return identity ? ` — ${identity}` : "";
  };
  // The name ends with the fitment (model, engine, years) — what people
  // search for next to the article. Rather than cutting it, drop the least
  // useful parts first: the site name (Google shows it separately), then the
  // manufacturer (still in the H1, description and Product schema). The
  // article always stays. The character budget is editorial; Google
  // truncates by rendered width.
  const suffixes = [
    `${withIdentity(makerPart, codePart)} | PartsON`,
    withIdentity(makerPart, codePart),
    withIdentity(codePart),
  ];
  for (const suffix of suffixes) {
    if (label.length + suffix.length <= SEO_TITLE_MAX_LENGTH) return `${label}${suffix}`;
  }
  const suffix = suffixes[suffixes.length - 1];
  return `${short(label, Math.max(20, SEO_TITLE_MAX_LENGTH - suffix.length))}${suffix}`;
}

export function buildProductMetaDescription(options: ProductIdentity) {
  const name = clean(buildVisibleProductName(options.productName || ""));
  const category = [options.subGroup, options.group, options.category]
    .map(value => clean(value).replace(/\s*\(([^()]+)\)/gu, (match: string, note: string, offset: number, label: string) =>
      label.slice(0, offset).toLocaleLowerCase("uk-UA").includes(note.trim().toLocaleLowerCase("uk-UA")) ? "" : ` ${match.trim()}`
    ))
    .find(value => value && value.toLocaleLowerCase("uk-UA") !== name.toLocaleLowerCase("uk-UA")) || "Автозапчастини";
  const identity = [clean(options.producer), clean(options.article)]
    .filter(value => value && !contains(category, value)).join(" ");
  // The description complements the product-name title/H1 with category
  // and buying context, without repeating the full name or volatile offers.
  const ending = " — купити у Львові в PartsON. Підбір за VIN і доставка по Україні.";
  const identityPart = identity ? `: ${short(identity, 42)}` : "";
  const categoryBudget = 160 - ending.length - identityPart.length;
  return trimSeoDescription(`${short(category, categoryBudget)}${identityPart}${ending}`);
}

export function buildProductImageAlt(options: ProductIdentity) {
  const name = clean(buildVisibleProductName(options.productName || "Автозапчастина"));
  const identity = [clean(options.producer), clean(options.article)].filter(value => value && !contains(name, value));
  return [name, ...identity].join(" — ");
}
