// VITOL supplier feed (Prom.ua-style CSV export, exporttype=4): parsing and
// pricing. Pure — no I/O and no imports — so scripts/sync-vitol.ts and the
// tests can both use it.
//
// Every VITOL item is sold "під замовлення": the site shows that for any
// product whose 1C quantity is 0, so the sync never sets stock, only prices.

// The feed price is VITOL's own retail price (ЦенаРРЦ), and we sell at it.
export const VITOL_DEFAULT_MARKUP_PERCENT = 0;
export const VITOL_DEFAULT_PRODUCER = "VITOL";

export type VitolFeedItem = {
  supplierCode: string;
  article: string;
  name: string;
  description: string;
  costUah: number;
  imageUrl: string;
  producer: string;
  groupName: string;
  availability: string;
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
      article: mpn || vitolArticle || supplierCode,
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
