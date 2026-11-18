// VITOL supplier feed (Prom.ua-style CSV export, exporttype=4): parsing and
// pricing. Pure — no I/O and no imports — so scripts/sync-vitol.ts and the
// tests can both use it.
//
// Every VITOL item is sold "під замовлення": the site shows that for any
// product whose 1C quantity is 0, so the sync never sets stock, only prices.

// The feed price is VITOL's own retail price (ЦенаРРЦ), and we sell at it.
export const VITOL_DEFAULT_MARKUP_PERCENT = 0;
export const VITOL_DEFAULT_PRODUCER = "VITOL";
// 1C's НомерПоКаталогу holds 25 characters and silently cuts longer ones;
// descriptions and price rows are looked up by it, so we cut first.
export const ONEC_ARTICLE_MAX = 25;
export const toOneCArticle = (value: string) => value.trim().slice(0, ONEC_ARTICLE_MAX).trim();

export type VitolFeedItem = {
  supplierCode: string;
  article: string;
  name: string;
  /** Plain text: paragraphs on their own lines (HTML from the feed stripped). */
  description: string;
  /** VITOL's price for the item, UAH (their retail price). */
  costUah: number;
  imageUrl: string;
  producer: string;
  groupName: string;
  availability: string;
  /** YML feed only. */
  categoryId?: string;
  categoryPath?: string[];
  params?: Array<{ name: string; value: string }>;
};

export type VitolFeedParseResult = {
  items: VitolFeedItem[];
  skipped: Array<{ line: number; reason: string; supplierCode?: string }>;
  header: string[];
};

const COLUMN = {
  code: "Код_товару",
  name: "Назва_позиції",
  description: "Опис",
  price: "Ціна",
  currency: "Валюта",
  image: "Посилання_зображення",
  availability: "Наявність",
  producer: "Виробник",
  groupName: "Назва_групи",
  id: "Ідентифікатор_товару",
  mpn: "Номер_пристрою_(MPN)",
} as const;

const REQUIRED_COLUMNS = [COLUMN.code, COLUMN.name, COLUMN.price];

/** RFC 4180-style CSV with a configurable delimiter: quoted fields may hold
 * the delimiter, line breaks and doubled quotes. */
export function parseCsvRows(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

/** "1 234,50" / "1234.5" → 1234.5; anything else → NaN. */
export function parseFeedNumber(raw: string): number {
  const cleaned = (raw || "").replace(/[\s ]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return Number.NaN;
  return Number(cleaned);
}

const collapse = (value: string | undefined) => (value || "").replace(/\s+/g, " ").trim();

const stripHtml = (value: string) =>
  collapse(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
  );

export function parseVitolFeed(text: string): VitolFeedParseResult {
  const rows = parseCsvRows(text);
  const header = (rows[0] || []).map((cell) => cell.trim());
  const missing = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  if (rows.length === 0 || missing.length > 0) {
    throw new Error(
      `VITOL feed: unexpected header (missing ${missing.join(", ") || "all columns"})`
    );
  }
  const index = (name: string) => header.indexOf(name);
  const cell = (cells: string[], name: string) => {
    const at = index(name);
    return at >= 0 ? cells[at] ?? "" : "";
  };

  const items: VitolFeedItem[] = [];
  const skipped: VitolFeedParseResult["skipped"] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((cells, offset) => {
    const line = offset + 2;
    // Код_товару is VITOL's article and repeats across variants; the numeric
    // Ідентифікатор_товару is the stable unique key.
    const vitolArticle = collapse(cell(cells, COLUMN.code));
    const supplierCode = collapse(cell(cells, COLUMN.id)) || vitolArticle;
    const name = collapse(cell(cells, COLUMN.name));
    const costUah = parseFeedNumber(cell(cells, COLUMN.price));
    const currency = collapse(cell(cells, COLUMN.currency)).toUpperCase();
    const availability = collapse(cell(cells, COLUMN.availability));

    if (!supplierCode) return skipped.push({ line, reason: "немає коду товару" });
    if (seen.has(supplierCode)) {
      return skipped.push({ line, reason: "дубль коду", supplierCode });
    }
    if (!name) return skipped.push({ line, reason: "немає назви", supplierCode });
    if (!(costUah > 0)) return skipped.push({ line, reason: "немає ціни", supplierCode });
    if (currency && currency !== "UAH" && currency !== "ГРН") {
      return skipped.push({ line, reason: `валюта ${currency}`, supplierCode });
    }
    // Prom.ua availability: "-" means the supplier can't deliver it at all.
    if (availability === "-") {
      return skipped.push({ line, reason: "немає у постачальника", supplierCode });
    }

    seen.add(supplierCode);
    const mpn = collapse(cell(cells, COLUMN.mpn));
    items.push({
      supplierCode,
      article: toOneCArticle(mpn || vitolArticle || supplierCode),
      name,
      description: stripHtml(cell(cells, COLUMN.description)),
      costUah,
      imageUrl: collapse(cell(cells, COLUMN.image)).split(",")[0]?.trim() || "",
      producer: collapse(cell(cells, COLUMN.producer)) || VITOL_DEFAULT_PRODUCER,
      groupName: collapse(cell(cells, COLUMN.groupName)),
      availability,
    });
    return undefined;
  });

  return { items, skipped, header };
}

/** Retail price in UAH: cost + markup, rounded up to a whole hryvnia. */
export function vitolRetailUah(costUah: number, markupPercent = VITOL_DEFAULT_MARKUP_PERCENT) {
  return Math.ceil(costUah * (1 + markupPercent / 100) - 1e-9);
}

/** 1C stores prices in euro; the site shows round(euro × rate). */
export function uahToEuro(uah: number, euroRate: number) {
  return Math.round((uah / euroRate) * 100) / 100;
}

/** Article + producer key used to spot products that already exist in 1C. */
export function vitolMatchKey(article: string, producer: string) {
  const norm = (value: string) => value.toLowerCase().replace(/[^0-9a-zа-яіїєґ]/gi, "");
  return `${norm(article)}|${norm(producer)}`;
}

// ---------------------------------------------------------------------------
// YML export (exporttype=3): the same offers as the CSV plus the category
// tree and characteristics. Offer ids equal the CSV Ідентифікатор_товару.

const decodeXml = (value: string) =>
  value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");

/** HTML description → text with one paragraph / list item per line. */
export function htmlToParagraphs(value: string) {
  return decodeXml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h\d|tr)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/&nbsp;/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim())
    .filter(Boolean)
    .join("\n");
}

const tag = (block: string, name: string) => {
  const match = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeXml(match[1]).trim() : "";
};

export type VitolYmlFeed = {
  items: VitolFeedItem[];
  skipped: VitolFeedParseResult["skipped"];
  /** offer id → price, for merging the regular-price export. */
  prices: Map<string, number>;
};

export function parseVitolYml(xml: string): VitolYmlFeed {
  if (!/<yml_catalog[\s>]/.test(xml) || !/<offers>/.test(xml)) {
    throw new Error("VITOL feed: not a YML catalog (exporttype=3)");
  }
  const categories = new Map<string, { parentId: string; name: string }>();
  for (const match of xml.matchAll(/<category id="(\d+)"(?: parentId="(\d+)")?>([^<]*)<\/category>/g)) {
    categories.set(match[1], { parentId: match[2] || "", name: collapse(decodeXml(match[3])) });
  }
  const pathOf = (id: string) => {
    const path: string[] = [];
    const seen = new Set<string>();
    let current = categories.get(id) ? id : "";
    while (current && !seen.has(current)) {
      seen.add(current);
      const node = categories.get(current);
      if (!node) break;
      path.unshift(node.name);
      current = node.parentId;
    }
    return path;
  };

  const items: VitolFeedItem[] = [];
  const skipped: VitolFeedParseResult["skipped"] = [];
  const prices = new Map<string, number>();
  let index = 0;
  for (const match of xml.matchAll(/<offer\s+id="([^"]+)"([^>]*)>([\s\S]*?)<\/offer>/g)) {
    index += 1;
    const supplierCode = match[1].trim();
    const attrs = match[2];
    const block = match[3];
    const price = parseFeedNumber(tag(block, "price"));
    if (price > 0) prices.set(supplierCode, price);
    const name = collapse(tag(block, "name"));
    const vendorCode = collapse(tag(block, "vendorCode"));
    const mpn = collapse(tag(block, "mpn"));
    const currency = collapse(tag(block, "currencyId")).toUpperCase();
    if (/available="false"/.test(attrs)) {
      skipped.push({ line: index, reason: "немає у постачальника", supplierCode });
      continue;
    }
    if (!name) {
      skipped.push({ line: index, reason: "немає назви", supplierCode });
      continue;
    }
    if (!(price > 0)) {
      skipped.push({ line: index, reason: "немає ціни", supplierCode });
      continue;
    }
    if (currency && currency !== "UAH") {
      skipped.push({ line: index, reason: `валюта ${currency}`, supplierCode });
      continue;
    }
    const categoryId = tag(block, "categoryId");
    const params: Array<{ name: string; value: string }> = [];
    for (const param of block.matchAll(/<param name="([^"]+)"[^>]*>([\s\S]*?)<\/param>/g)) {
      const paramName = collapse(decodeXml(param[1]));
      const value = collapse(decodeXml(param[2]));
      if (paramName && value) params.push({ name: paramName, value });
    }
    items.push({
      supplierCode,
      article: toOneCArticle(mpn || vendorCode || supplierCode),
      name,
      description: htmlToParagraphs(tag(block, "description")),
      costUah: price,
      imageUrl: collapse(tag(block, "picture")),
      producer: collapse(tag(block, "vendor")) || VITOL_DEFAULT_PRODUCER,
      groupName: pathOf(categoryId).join(" / "),
      availability: "+",
      categoryId,
      categoryPath: pathOf(categoryId),
      params,
    });
  }
  return { items, skipped, prices };
}

// Characteristics worth showing on the product page, VITOL name → our label.
// Logistics codes and box sizes (УКТВЕД, *ВГХ) are left out; weight stays.
const PARAM_LABELS: Record<string, string> = {
  "вес вгх": "Вага, кг",
  "направление применения": "Застосування",
};
const PARAM_SKIPPED = new Set(["уктвед", "ширина вгх", "длина вгх", "высота вгх", "торгова марка", "квадрат"]);

// 1C's Описание field holds 1024 characters and cuts the rest mid-word.
export const ONEC_DESCRIPTION_MAX = 1024;

// VITOL's brand boilerplate, repeated across hundreds of products.
const BOILERPLATE =
  /(ТМ\s+Витол\s+гарантує|VIT[OО]L\s+вже\s+20\s+рок|20\s+років\s+на\s+ринку|Про\s+надійність\s+товарів\s+VIT[OО]L|Втілюючи\s+британські\s+стандарти)/i;

/** Cuts text to `limit` at the last sentence end, or returns "" if too little is left. */
const cutAtSentence = (text: string, limit: number) => {
  if (text.length <= limit) return text;
  const head = text.slice(0, limit);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "), head.lastIndexOf("; "));
  const cut = end >= 0 ? head.slice(0, end + 1) : head.endsWith(".") ? head : "";
  return cut.length >= 80 ? cut.trim() : "";
};

/**
 * Text for the 1C description: the feed's own paragraphs (minus a repeat of
 * the product name and VITOL's brand boilerplate), then "Назва\tЗначення"
 * rows, the format the product page already renders as a characteristics
 * table. Fitted into 1C's 1024 characters: the characteristics always fit,
 * paragraphs are taken whole and the last one is cut at a sentence end.
 */
export function vitolDescription(
  item: Pick<VitolFeedItem, "name" | "description" | "params">,
  maxLength = ONEC_DESCRIPTION_MAX
) {
  const sameAsName = (line: string) =>
    line.toLocaleLowerCase("uk-UA").replace(/\s+/g, " ").trim() ===
    item.name.toLocaleLowerCase("uk-UA").replace(/\s+/g, " ").trim();
  const paragraphs = (item.description || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !sameAsName(line) && !BOILERPLATE.test(line));

  const specs: string[] = [];
  const seen = new Set<string>();
  let specsLength = 0;
  for (const param of item.params || []) {
    const key = param.name.toLocaleLowerCase("uk-UA").trim();
    if (PARAM_SKIPPED.has(key)) continue;
    const label = PARAM_LABELS[key] || param.name.replace(/\t/g, " ");
    if (seen.has(label)) continue;
    const row = `${label}\t${param.value.replace(/\t/g, " ")}`.slice(0, 160);
    // Characteristics may take at most half the room.
    if (specsLength + row.length + 1 > maxLength / 2) break;
    seen.add(label);
    specs.push(row);
    specsLength += row.length + 1;
  }

  let room = maxLength - specsLength;
  const kept: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length + 1 <= room) {
      kept.push(paragraph);
      room -= paragraph.length + 1;
      continue;
    }
    // Bullet points are kept whole or not at all.
    const cut = paragraph.startsWith("•") ? "" : cutAtSentence(paragraph, room - 1);
    if (cut) kept.push(cut);
    break;
  }
  // A heading ("Переваги:") whose list did not fit says nothing on its own.
  while (kept.length && /:$/.test(kept[kept.length - 1])) kept.pop();
  return [...kept, ...specs].join("\n").slice(0, maxLength);
}

/** Stable short hash so the sync only resends changed descriptions. */
export function textHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
