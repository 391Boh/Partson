import { fixCatalogSpelling, formatCatalogLabel } from "app/lib/catalog-label-format";
import { splitProductFitmentLine, type ProductFitmentGroup } from "app/lib/product-fitment-format";
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
type ProductDescriptionInput = ProductIdentity & {
  // The 1C description; its first line is the fitment list (see
  // product-fitment-format.ts).
  fitmentSource?: string;
};

const SEO_TITLE_MAX_LENGTH = 65;

export function buildProductSeoTitle({ name, producer, article }: { name: string; producer?: string; article?: string }) {
  const label = fixCatalogSpelling(clean(buildVisibleProductName(name))) || "Автозапчастина";
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

// The part itself, as people name it: the leading Ukrainian words of the 1C
// name before the vehicle/codes ("Диск гальмівний передній VIVARO TRAFIC
// 01-" → "Диск гальмівний передній"). Singular, unlike the group label.
const productKind = (name: string) => {
  const words: string[] = [];
  for (const word of name.split(" ")) {
    if (!/^[\p{Script=Cyrillic}][\p{Script=Cyrillic}'’.-]*$/u.test(word)) break;
    words.push(word);
  }
  return words.join(" ").replace(/[,.;:]+$/u, "");
};

// "NAVARA NP300" → "Navara NP300", "MERCEDES-BENZ" → "Mercedes-Benz";
// codes and short marks (BMW, II, W203, T5) stay as written.
const readableVehicleWord = (word: string) =>
  word.split("-").map(part =>
    /^[A-Z]{4,}$/.test(part) ? part[0] + part.slice(1).toLowerCase() : part
  ).join("-");
const readableVehicle = (text: string) => text.split(" ").map(readableVehicleWord).join(" ");

const FITMENT_BUDGET_TAIL = " та інших";
// "Nissan Primastar, Navara NP300; Opel Vivaro A; Renault Trafic II" within
// `budget` chars, whole models only. Makes come first: one model of each
// make, then the rest in order — a search for any of the makes should find
// it in the snippet.
const fitmentList = (groups: ProductFitmentGroup[], budget: number) => {
  const byBrand = new Map<string, string[]>();
  for (const group of groups) {
    const models = byBrand.get(group.brand) ?? [];
    for (const model of group.models) if (!models.includes(model)) models.push(model);
    byBrand.set(group.brand, models);
  }
  const kept = new Map<string, string[]>(Array.from(byBrand.keys(), brand => [brand, []]));
  const render = () => Array.from(kept)
    .filter(([, models]) => models.length)
    .map(([brand, models]) => `${readableVehicle(brand)} ${models.map(readableVehicle).join(", ")}`)
    .join("; ");
  const total = Array.from(byBrand.values()).reduce((sum, models) => sum + models.length, 0);
  let added = 0;
  for (let round = 0; added < total; round += 1) {
    let progressed = false;
    for (const [brand, models] of byBrand) {
      const model = models[round];
      if (!model) continue;
      kept.get(brand)!.push(model);
      if (render().length + FITMENT_BUDGET_TAIL.length > budget) {
        kept.get(brand)!.pop();
        const text = render();
        return text ? `${text}${FITMENT_BUDGET_TAIL}` : "";
      }
      added += 1;
      progressed = true;
    }
    if (!progressed) break;
  }
  return render();
};

// The vehicle part of the name when 1C has no fitment list: "FUSION FIESTA
// 01-" → "Fusion Fiesta (з 2001)", "RECORD 1.8 83-" → "Record 1.8 (з 1983)".
const nameVehicle = (name: string, kind: string) => {
  const tail = name.slice(kind.length).trim();
  if (!tail || !/[A-Za-z]/.test(tail)) return "";
  const year = (value: string) => String(Number(value) >= 40 ? 1900 + Number(value) : 2000 + Number(value));
  let period = "";
  const words = tail.split(" ").filter(word => {
    const match = word.match(/^(\d{2})-(\d{2})?$/);
    if (!match) return true;
    period = match[2] ? `${year(match[1])}–${year(match[2])}` : `з ${year(match[1])}`;
    return false;
  });
  const vehicle = readableVehicle(words.join(" ").replace(/[,;]+$/u, ""));
  if (!vehicle) return "";
  return period ? `${vehicle} (${period})` : vehicle;
};

/** Readable vehicle list from a 1C fitment line, within `budget` chars, or "". */
export const buildFitmentSummary = (fitmentLine: string | undefined, budget: number) => {
  const line = clean((fitmentLine || "").split(/\r?\n/)[0]);
  const fitment = line ? splitProductFitmentLine(line) : null;
  return fitment ? fitmentList(fitment.groups, budget) : "";
};

// "Комплекти та ремені ГРМ" → "комплекти та ремені ГРМ": abbreviations keep their case.
const lowerFirst = (value: string) =>
  /^\p{Lu}\p{Ll}/u.test(value) ? value[0].toLocaleLowerCase("uk-UA") + value.slice(1) : value;

const DESCRIPTION_MAX_LENGTH = 160;
const DESCRIPTION_ENDING = " Купити в PartsON: Львів, доставка по Україні.";
const DESCRIPTION_VIN = " Оригінали й аналоги, перевірка сумісності за VIN.";

export function buildProductMetaDescription(options: ProductDescriptionInput) {
  const name = options.productName ? fixCatalogSpelling(clean(buildVisibleProductName(options.productName))) : "";
  const category = [options.subGroup, options.group, options.category]
    .map(value => formatCatalogLabel(clean(value).replace(/\s*\(([^()]+)\)/gu, (match: string, note: string, offset: number, label: string) =>
      label.slice(0, offset).toLocaleLowerCase("uk-UA").includes(note.trim().toLocaleLowerCase("uk-UA")) ? "" : ` ${match.trim()}`
    )))
    .find(value => value && value.toLocaleLowerCase("uk-UA") !== name.toLocaleLowerCase("uk-UA")) || "Автозапчастини";
  const kind = (name && productKind(name)) || category;
  const identity = [clean(options.producer), clean(options.article)]
    .filter(value => value && !contains(kind, value)).join(" ");
  // The maker and article always stay; a long name gives way.
  const subject = [short(kind, Math.max(24, 70 - identity.length - 1)), identity].filter(Boolean).join(" ");
  const firstLine = clean((options.fitmentSource || "").split(/\r?\n/)[0]);
  const fitment = firstLine ? splitProductFitmentLine(firstLine) : null;
  // The description complements the product-name title/H1: what the part is
  // (singular), which cars it fits — what buyers search next to the name —
  // and how to buy. No price or stock: those change faster than Google
  // recrawls.
  const budget = DESCRIPTION_MAX_LENGTH - DESCRIPTION_ENDING.length - subject.length - " для .".length;
  const fallbackVehicle = nameVehicle(name, kind);
  const vehicles = (fitment ? fitmentList(fitment.groups, budget) : "")
    || (fallbackVehicle.length <= budget ? fallbackVehicle : "");
  // "Паливний фільтр" already says "Фільтр палива": compare word stems.
  const stems = (text: string) => new Set(text.toLocaleLowerCase("uk-UA").split(/[^\p{L}]+/u).filter(word => word.length >= 4).map(word => word.slice(0, 5)));
  const kindStems = stems(kind);
  const kindIsCategory = Array.from(stems(category)).some(stem => kindStems.has(stem));
  const lead = vehicles
    ? `${subject} для ${vehicles}.`
    : kindIsCategory
      ? `${subject}.`
      : `${subject} — ${lowerFirst(category)}.`;
  const description = `${lead}${DESCRIPTION_ENDING}`;
  return trimSeoDescription(
    description.length + DESCRIPTION_VIN.length <= DESCRIPTION_MAX_LENGTH ? `${lead}${DESCRIPTION_VIN}${DESCRIPTION_ENDING}` : description
  );
}

export function buildProductImageAlt(options: ProductIdentity) {
  const name = fixCatalogSpelling(clean(buildVisibleProductName(options.productName || "Автозапчастина")));
  const identity = [clean(options.producer), clean(options.article)].filter(value => value && !contains(name, value));
  return [name, ...identity].join(" — ");
}
