// Sync the VITOL supplier feed into 1C as "під замовлення" products.
//
//   npm run vitol:sync                 # dry run: download, price, compare, report
//   npm run vitol:sync -- --apply      # write to 1C
//   npm run vitol:sync -- --apply --limit 20      # first 20 new products only
//   npm run vitol:sync -- --file feed.xml [--regular-file feed-regular.xml]
//   npm run vitol:sync -- --no-images  # don't upload photos with new products
//   npm run vitol:sync -- --no-descriptions        # skip description writes
//
// Source: the YML export (exporttype=3) — offers, the category tree and
// characteristics. VITOL_FEED_URL may be any of their export links; the
// script derives the two YML links it needs from it: saleprice=1 (current
// price, promotions included) and saleprice=0 (regular price). The lower of
// the two is VITOL's retail price on vitol.com.ua.
//
// Each run, for every offer:
//  - new: create it in 1C (quantity 0, so the site shows "Під замовлення"),
//    in the section "Інше" and the group from app/lib/vitol-groups.ts, then
//    write its price (createproduct ignores prices) and its description;
//  - known: fix the price when VITOL changed it or the euro rate drifted,
//    move it when its group changed, rewrite the description when it changed.
// Missing producers and groups are created first (createproduct only links
// existing ones). Which 1C codes came from VITOL is kept in state.json in the
// data dir; a VITOL item whose article+producer already exists in 1C is left
// alone (our own stock and pricing win).
//
// Env: VITOL_FEED_URL (or <data dir>/config.json {"feedUrl"}), VITOL_DATA_DIR,
// VITOL_MARKUP_PERCENT (default 0: sell at VITOL's retail price),
// VITOL_COST_DISCOUNT_PERCENT (purchase price = VITOL price minus this dealer
// discount; default 0 — the feed carries no dealer price).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import { oneCRequest } from "../app/api/_lib/oneC";
import { writeCatalogChange } from "../app/lib/catalog-change-log";
import { fetchConfirmedEuroRate, fetchFullCatalogProducts } from "../app/lib/catalog-server";
import {
  VITOL_DEFAULT_MARKUP_PERCENT,
  parseVitolYml,
  textHash,
  toOneCArticle,
  uahToEuro,
  vitolDescription,
  vitolMatchKey,
  vitolRetailUah,
  type VitolFeedItem,
} from "../app/lib/vitol-feed";
import { VITOL_GROUP_SECTION, vitolGroupFor, type VitolGroup } from "../app/lib/vitol-groups";

type StateEntry = {
  code: string;
  article: string;
  /** VITOL's price at the last sync, UAH. */
  costUah: number;
  retailUah: number;
  priceEuro: number;
  costPriceEuro?: number;
  group?: string;
  descHash?: string;
  syncedAt: string;
};
type State = { items: Record<string, StateEntry> };

const ROOT = process.cwd();
// On the server this points outside the release dir (VITOL_DATA_DIR), so the
// record of which 1C codes came from VITOL survives deploys.
const DATA_DIR = (process.env.VITOL_DATA_DIR || "").trim() || join(ROOT, "data", "vitol");
const CONFIG_FILE = join(DATA_DIR, "config.json");
const STATE_FILE = join(DATA_DIR, "state.json");
const REPORT_FILE = join(DATA_DIR, "last-run.json");

const CREATE_ENDPOINT = (process.env.ONEC_PRODUCT_CREATE_ENDPOINT || "createproduct").trim();
const EDIT_ENDPOINT = (
  process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || process.env.ONEC_PRICE_ADMIN_ENDPOINT || "edit"
).trim();
const DESCRIPTION_ENDPOINT = (process.env.ONEC_SET_DESCRIPTION_ENDPOINT || "getinfo").trim();
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const MOVE_BATCH = 500; // 1C's ПеренестиТовари limit
// Re-send a price when the hryvnia price shown on the site drifts this much
// from the target (euro-rate moves), or whenever VITOL changes its price.
const PRICE_DRIFT_RATIO = 0.01;
// The single top-level group the first import used; emptied by the move into
// "Інше" and then removed.
const LEGACY_GROUP = "Автотовари та інструмент";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const apply = flag("--apply");
const withImages = !flag("--no-images");
const withDescriptions = !flag("--no-descriptions");
const createLimit = Number(option("--limit")) > 0 ? Math.floor(Number(option("--limit"))) : Infinity;
const percentEnv = (name: string, fallback: number) => {
  const raw = Number(process.env[name]);
  return process.env[name] !== undefined && Number.isFinite(raw) && raw >= 0 && raw < 100 ? raw : fallback;
};
const markupPercent = percentEnv("VITOL_MARKUP_PERCENT", VITOL_DEFAULT_MARKUP_PERCENT);
const costDiscountPercent = percentEnv("VITOL_COST_DISCOUNT_PERCENT", 0);

const readState = (): State => {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as State;
    return parsed && typeof parsed.items === "object" ? parsed : { items: {} };
  } catch {
    return { items: {} };
  }
};

const writeJson = (file: string, value: unknown) => {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

const expandHome = (path: string) => path.replace(/^~(?=\/)/, process.env.HOME || "~");

const feedUrl = () => {
  // The link carries a token, so it lives in the env or the untracked
  // <data dir>/config.json ({"feedUrl": "..."}), never in the repo.
  let url = (process.env.VITOL_FEED_URL || "").trim();
  if (!url) {
    try {
      url = String((JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as { feedUrl?: string }).feedUrl || "").trim();
    } catch {
      // no config file
    }
  }
  if (!url) throw new Error(`Не задано VITOL_FEED_URL ні ${CONFIG_FILE} (або передайте --file)`);
  return url;
};

const ymlUrl = (base: string, salePrice: 0 | 1) => {
  const url = new URL(base);
  url.searchParams.set("exporttype", "3");
  url.searchParams.set("saleprice", String(salePrice));
  url.searchParams.set("currency", "uah");
  url.searchParams.set("lang", "uk");
  url.searchParams.set("tofile", "1");
  return url.toString();
};

async function fetchText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`VITOL feed HTTP ${response.status}`);
  return response.text();
}

async function loadFeeds() {
  const file = option("--file");
  if (file) {
    if (!existsSync(expandHome(file))) throw new Error(`Файл не знайдено: ${file}`);
    const regularFile = option("--regular-file");
    return {
      current: readFileSync(expandHome(file), "utf8"),
      regular: regularFile ? readFileSync(expandHome(regularFile), "utf8") : null,
    };
  }
  const base = feedUrl();
  const [current, regular] = await Promise.all([fetchText(ymlUrl(base, 1)), fetchText(ymlUrl(base, 0))]);
  return { current, regular };
}

async function downloadImageBase64(url: string) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (!/image\/(jpeg|png|webp|gif)/.test(type)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
    return { base64: buffer.toString("base64"), ext };
  } catch {
    return null;
  }
}

const parseOneC = (text: string) => {
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const oneCError = (parsed: Record<string, unknown>, status: number) =>
  String(parsed.error_message || parsed.message || parsed.error || `HTTP ${status}`);

async function createInOneC(item: VitolFeedItem, group: string) {
  const body: Record<string, unknown> = {
    Наименование: item.name,
    НомерПоКаталогу: item.article,
    ПроизводительНаименование: item.producer,
    // createproduct takes the group by name, preferring the one under this parent.
    Группа: VITOL_GROUP_SECTION[group as VitolGroup],
    Подгруппа: group,
  };
  if (withImages) {
    const image = await downloadImageBase64(item.imageUrl);
    if (image) {
      body.file_name = `${item.article.replace(/[^\w.-]+/g, "_")}.${image.ext}`;
      body.image_base64 = image.base64;
    }
  }
  const result = await oneCRequest(CREATE_ENDPOINT, { method: "POST", body, timeoutMs: 25_000, retries: 0, cacheTtlMs: 0 });
  const parsed = parseOneC(result.text);
  if (result.status < 200 || result.status >= 300 || parsed.success === false) throw new Error(oneCError(parsed, result.status));
  const code = String(parsed["Код"] || parsed.code || "").trim();
  if (!code) throw new Error("1С не повернула код товару");
  return { code, article: String(parsed["НомерПоКаталогу"] || item.article) };
}

async function adminAction<T>(action: string, params: Record<string, unknown> = {}) {
  const result = await oneCRequest(EDIT_ENDPOINT, {
    method: "POST",
    body: { Дія: action, ...params },
    timeoutMs: 120_000,
    retries: 0,
    cacheTtlMs: 0,
  });
  const parsed = parseOneC(result.text) as Record<string, unknown> & T;
  if (result.status < 200 || result.status >= 300 || parsed.success === false) {
    throw new Error(`${action}: ${oneCError(parsed, result.status)}`);
  }
  return parsed;
}

const normName = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
type OneCGroup = { code: string; name: string; parent_code: string; products?: number };

const listGroups = async () =>
  (await adminAction<{ items?: OneCGroup[] }>("СписокГруп")).items || [];

/** Each needed group inside its own section (VITOL_GROUP_SECTION); sections
 *  and groups are created when missing (apply only). */
async function ensureGroups(names: string[]) {
  let groups = await listGroups();
  const codes = new Map<string, string>();
  const missing: string[] = [];
  const created: string[] = [];
  for (const name of [...new Set(names)]) {
    const sectionName = VITOL_GROUP_SECTION[name as VitolGroup];
    let section = groups.find((group) => !group.parent_code && normName(group.name) === normName(sectionName));
    if (!section) {
      if (!apply) {
        missing.push(`${sectionName} → ${name}`);
        continue;
      }
      await adminAction("СтворитиГрупу", { Назва: sectionName });
      created.push(sectionName);
      groups = await listGroups();
      section = groups.find((group) => !group.parent_code && normName(group.name) === normName(sectionName));
      if (!section) throw new Error(`Не вдалося створити розділ «${sectionName}»`);
    }
    const found = groups.find((group) => group.parent_code === section.code && normName(group.name) === normName(name));
    if (found) {
      codes.set(name, found.code);
      continue;
    }
    if (!apply) {
      missing.push(`${sectionName} → ${name}`);
      continue;
    }
    const result = await adminAction<{ code?: string }>("СтворитиГрупу", { Назва: name, КодБатька: section.code });
    if (!result.code) throw new Error(`1С не повернула код групи «${name}»`);
    codes.set(name, String(result.code));
    created.push(`${sectionName} → ${name}`);
    groups = await listGroups();
  }
  return { codes, missing, created };
}

/** createproduct links a producer only if it already exists in 1C. */
async function ensureOneCProducers(names: string[]) {
  const list = await adminAction<{ items?: Array<{ name: string }> }>("СписокВиробників");
  const known = new Set((list.items || []).map((producer) => normName(producer.name)));
  const missing = [...new Set(names.map((name) => name.trim()).filter(Boolean))].filter((name) => !known.has(normName(name)));
  const failed: string[] = [];
  if (apply) {
    for (const name of missing) {
      try {
        await adminAction("СтворитиВиробника", { Назва: name });
      } catch {
        failed.push(name);
      }
    }
  }
  return { missing, failed };
}

async function updatePriceInOneC(entry: StateEntry, priceEuro: number, costEuro: number) {
  const result = await oneCRequest(EDIT_ENDPOINT, {
    method: "POST",
    body: { Код: entry.code, артикул_ціни: entry.article, ЦінаПрод: priceEuro, ЦінаЗакуп: costEuro },
    retries: 1,
    retryDelayMs: 300,
    cacheTtlMs: 0,
  });
  const parsed = parseOneC(result.text);
  if (result.status < 200 || result.status >= 300 || parsed.success === false || parsed.found === false) {
    throw new Error(oneCError(parsed, result.status));
  }
}

// By 1C code (getinfo accepts Код since the 1C module loaded 2026-11-20):
// by НомерПоКаталогу 1C finds only the first product with that article, so
// products sharing one (VITOL's duplicates, AP01 vs ap01, K52, the 3M 1600
// tapes) could not get their own descriptions.
async function setDescriptionInOneC(code: string, text: string) {
  const result = await oneCRequest(DESCRIPTION_ENDPOINT, {
    method: "POST",
    body: { Код: code, Описание: text },
    timeoutMs: 20_000,
    retries: 1,
    retryDelayMs: 300,
    cacheTtlMs: 0,
  });
  const parsed = parseOneC(result.text);
  if (
    result.status < 200 ||
    result.status >= 300 ||
    parsed.success === false ||
    parsed.found === false ||
    parsed.updated === false ||
    parsed.error ||
    parsed.error_message
  ) {
    throw new Error(oneCError(parsed, result.status));
  }
}

async function main() {
  const startedAt = new Date();
  console.log(
    `VITOL sync ${apply ? "APPLY" : "DRY RUN"} · націнка ${markupPercent}% · знижка закупки ${costDiscountPercent}% · ${startedAt.toISOString()}`
  );

  const feeds = await loadFeeds();
  const feed = parseVitolYml(feeds.current);
  const regular = feeds.regular ? parseVitolYml(feeds.regular).prices : new Map<string, number>();
  // VITOL's retail price: the regular one, or the promotion price when lower.
  for (const item of feed.items) {
    const regularPrice = regular.get(item.supplierCode);
    if (regularPrice && regularPrice > 0 && regularPrice < item.costUah) item.costUah = regularPrice;
  }
  console.log(`Фід: ${feed.items.length} товарів, пропущено ${feed.skipped.length}, звичайних цін: ${regular.size}`);
  if (feed.items.length === 0) {
    console.log("У фіді немає товарів — нічого не роблю. Перевірте налаштування експорту в кабінеті VITOL.");
    writeJson(REPORT_FILE, { startedAt, apply, markupPercent, feedItems: 0, skipped: feed.skipped });
    return;
  }

  const euroRate = await fetchConfirmedEuroRate();
  if (!euroRate || !(euroRate > 0)) throw new Error("Немає підтвердженого курсу євро з 1С — зупиняюсь");
  console.log(`Курс євро: ${euroRate}`);

  const groupOf = new Map(
    feed.items.map((item) => [item.supplierCode, vitolGroupFor({ categoryPath: item.categoryPath || [], categoryId: item.categoryId, name: item.name })])
  );
  const groups = await ensureGroups([...new Set(groupOf.values())]);
  console.log(
    `Групи VITOL: ${groups.codes.size}` +
      (groups.created.length ? `, створено: ${groups.created.join(", ")}` : "") +
      (groups.missing.length ? `, буде створено: ${groups.missing.join(", ")}` : "")
  );

  const state = readState();
  const newProducers = feed.items
    .filter((item) => !state.items[item.supplierCode])
    .slice(0, createLimit)
    .map((item) => item.producer);
  const producers = await ensureOneCProducers(newProducers);
  console.log(
    `Виробники, яких немає в 1С: ${producers.missing.length}${producers.missing.length ? ` (${producers.missing.slice(0, 12).join(", ")}${producers.missing.length > 12 ? ", …" : ""})` : ""}` +
      (producers.missing.length ? (apply ? ` — створено ${producers.missing.length - producers.failed.length}` : " — будуть створені") : "")
  );

  const ownCodes = new Set(Object.values(state.items).map((entry) => entry.code.toLowerCase()));
  const existing = new Map<string, string>();
  for (const product of await fetchFullCatalogProducts()) {
    if (ownCodes.has(product.code.toLowerCase())) continue;
    const key = vitolMatchKey(product.article, product.producer);
    if (key !== "|") existing.set(key, product.code);
  }
  console.log(`Каталог 1С: ${existing.size} власних позицій для перевірки дублів`);

  const report = {
    startedAt,
    apply,
    markupPercent,
    costDiscountPercent,
    euroRate,
    feedItems: feed.items.length,
    skipped: feed.skipped,
    created: [] as Array<{ supplierCode: string; code?: string; article: string; retailUah: number; group: string }>,
    updated: [] as Array<{ supplierCode: string; code: string; fromUah: number; toUah: number }>,
    moved: 0,
    toMove: 0,
    descriptions: 0,
    alreadyInOneC: [] as Array<{ supplierCode: string; article: string; code: string }>,
    failed: [] as Array<{ supplierCode: string; action: string; error: string }>,
    unchanged: 0,
    goneFromFeed: [] as string[],
    groups: {} as Record<string, number>,
    legacyGroupRemoved: false,
  };
  const moves = new Map<string, string[]>(); // group name → 1C codes
  const fail = (supplierCode: string, action: string, error: unknown) =>
    report.failed.push({ supplierCode, action, error: String((error as Error)?.message || error) });

  const syncDescription = async (item: VitolFeedItem, entry: StateEntry) => {
    if (!withDescriptions) return;
    const text = vitolDescription(item);
    const hash = text ? textHash(text) : "";
    if (entry.descHash === hash) return;
    if (!text) {
      entry.descHash = hash;
      return;
    }
    report.descriptions += 1;
    if (!apply) return;
    try {
      await setDescriptionInOneC(entry.code, text);
      entry.descHash = hash;
    } catch (error) {
      fail(item.supplierCode, "description", error);
    }
  };

  let createdCount = 0;
  let processed = 0;
  for (const item of feed.items) {
    processed += 1;
    if (apply && processed % 250 === 0) {
      writeJson(STATE_FILE, state);
      console.log(`  … ${processed}/${feed.items.length}`);
    }
    const group = groupOf.get(item.supplierCode)!;
    report.groups[group] = (report.groups[group] || 0) + 1;
    const retailUah = vitolRetailUah(item.costUah, markupPercent);
    const priceEuro = uahToEuro(retailUah, euroRate);
    const purchaseUah = Math.round(item.costUah * (1 - costDiscountPercent / 100) * 100) / 100;
    const costEuro = uahToEuro(purchaseUah, euroRate);
    const known = state.items[item.supplierCode];

    if (known) {
      // Entries from before the 25-character cut carry the full article.
      known.article = toOneCArticle(known.article);
      const shownUah = known.priceEuro > 0 ? Math.round(known.priceEuro * euroRate) : 0;
      const drift = Math.abs(shownUah - retailUah) / retailUah;
      const costChanged = known.costPriceEuro !== undefined && Math.abs(known.costPriceEuro - costEuro) >= 0.01;
      if (known.priceEuro > 0 && known.costUah === item.costUah && drift <= PRICE_DRIFT_RATIO && !costChanged) {
        report.unchanged += 1;
      } else {
        report.updated.push({ supplierCode: item.supplierCode, code: known.code, fromUah: shownUah, toUah: retailUah });
        if (apply) {
          try {
            await updatePriceInOneC(known, priceEuro, costEuro);
            Object.assign(known, { costUah: item.costUah, retailUah, priceEuro, costPriceEuro: costEuro, syncedAt: new Date().toISOString() });
          } catch (error) {
            fail(item.supplierCode, "price", error);
          }
        }
      }
      if (known.group !== group) {
        report.toMove += 1;
        moves.set(group, [...(moves.get(group) || []), known.code]);
      }
      await syncDescription(item, known);
      continue;
    }

    const duplicateCode = existing.get(vitolMatchKey(item.article, item.producer));
    if (duplicateCode) {
      report.alreadyInOneC.push({ supplierCode: item.supplierCode, article: item.article, code: duplicateCode });
      continue;
    }

    if (createdCount >= createLimit) continue;
    createdCount += 1;
    if (!apply) {
      report.created.push({ supplierCode: item.supplierCode, article: item.article, retailUah, group });
      if (vitolDescription(item)) report.descriptions += 1;
      continue;
    }
    try {
      const created = await createInOneC(item, group);
      const entry: StateEntry = {
        code: created.code,
        article: created.article,
        costUah: item.costUah,
        retailUah,
        // 0 until the price write succeeds, so the next run retries it.
        priceEuro: 0,
        group,
        syncedAt: new Date().toISOString(),
      };
      state.items[item.supplierCode] = entry;
      try {
        await updatePriceInOneC(entry, priceEuro, costEuro);
        Object.assign(entry, { priceEuro, costPriceEuro: costEuro });
      } catch (error) {
        fail(item.supplierCode, "price", error);
      }
      await syncDescription(item, entry);
      report.created.push({ supplierCode: item.supplierCode, code: created.code, article: created.article, retailUah, group });
    } catch (error) {
      fail(item.supplierCode, "create", error);
    }
  }

  // Group moves, in 1C's batches.
  if (apply) {
    const byCode = new Map(Object.values(state.items).map((entry) => [entry.code, entry]));
    for (const [group, codes] of moves) {
      const groupCode = groups.codes.get(group);
      if (!groupCode) {
        codes.forEach((code) => fail(code, "move", `немає групи «${group}»`));
        continue;
      }
      for (let start = 0; start < codes.length; start += MOVE_BATCH) {
        const batch = codes.slice(start, start + MOVE_BATCH);
        try {
          const result = await adminAction<{ moved?: unknown[] }>("ПеренестиТовари", { Коди: batch, КодГрупи: groupCode });
          const moved = Array.isArray(result.moved) ? result.moved.map(String) : batch;
          for (const code of moved) {
            const entry = byCode.get(code);
            if (entry) entry.group = group;
          }
          report.moved += moved.length;
        } catch (error) {
          batch.forEach((code) => fail(code, "move", error));
        }
      }
    }
    writeJson(STATE_FILE, state);

    // The first import's single group, once empty.
    try {
      const legacy = (await listGroups()).find((group) => !group.parent_code && normName(group.name) === normName(LEGACY_GROUP));
      if (legacy && Number(legacy.products || 0) === 0) {
        await adminAction("ВидалитиГрупу", { Код: legacy.code });
        report.legacyGroupRemoved = true;
      }
    } catch (error) {
      fail(LEGACY_GROUP, "legacy-group", error);
    }
  }

  const inFeed = new Set(feed.items.map((item) => item.supplierCode));
  report.goneFromFeed = Object.keys(state.items).filter((supplierCode) => !inFeed.has(supplierCode));

  if (apply) writeJson(STATE_FILE, state);
  writeJson(REPORT_FILE, report);

  // One journal entry per run that changed something (Каталог → Журнал змін).
  const createdProducers = producers.missing.length - producers.failed.length;
  const changed = report.created.length || report.updated.length || report.moved || report.descriptions || report.failed.length || createdProducers || groups.created.length;
  if (apply && changed) {
    const priceChanges = report.updated.filter((entry) => entry.fromUah > 0);
    await writeCatalogChange({
      action: "supplier.sync",
      actor: "VITOL",
      target: "VITOL",
      count: report.created.length + report.updated.length + report.moved,
      details: [
        report.created.length ? `створено товарів: ${report.created.length}` : "",
        report.updated.length ? `оновлено цін: ${report.updated.length}` : "",
        report.moved ? `перенесено в групи: ${report.moved}` : "",
        report.descriptions ? `описів: ${report.descriptions}` : "",
        groups.created.length ? `нові групи: ${groups.created.join(", ")}` : "",
        createdProducers ? `нові виробники: ${producers.missing.filter((name) => !producers.failed.includes(name)).join(", ")}` : "",
        report.legacyGroupRemoved ? `видалено порожню групу «${LEGACY_GROUP}»` : "",
        report.failed.length ? `помилок: ${report.failed.length}` : "",
        priceChanges.length ? `напр. ${priceChanges.slice(0, 3).map((entry) => `${entry.code} ${entry.fromUah}→${entry.toUah} грн`).join(", ")}` : "",
      ].filter(Boolean).join(" · "),
    }).catch((error) => console.warn("Журнал змін не записано:", error instanceof Error ? error.message : error));
  }

  const verb = (done: string, planned: string) => (apply ? done : planned);
  console.log(
    [
      `${verb("Створено", "Буде створено")}: ${report.created.length}${createLimit < Infinity ? ` (ліміт ${createLimit})` : ""}`,
      `${verb("Оновлено ціни", "Буде оновлено ціни")}: ${report.updated.length}`,
      `${verb("Перенесено в групи", "Буде перенесено в групи")}: ${apply ? report.moved : report.toMove}`,
      `${verb("Записано описів", "Буде записано описів")}: ${report.descriptions}`,
      `Без змін у ціні: ${report.unchanged}`,
      `Вже є в 1С (не чіпаю): ${report.alreadyInOneC.length}`,
      `Зникли з фіду: ${report.goneFromFeed.length}`,
      report.legacyGroupRemoved ? `Видалено порожню групу «${LEGACY_GROUP}»` : "",
      `Помилки: ${report.failed.length}`,
      `Групи: ${Object.entries(report.groups).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name} ${count}`).join(", ")}`,
      `Звіт: ${REPORT_FILE}`,
    ].filter(Boolean).join("\n")
  );
  for (const sample of report.created.slice(0, 5)) console.log(`  + ${sample.article} → ${sample.retailUah} грн · ${sample.group}`);
  for (const failure of report.failed.slice(0, 10)) console.log(`  ! ${failure.action} ${failure.supplierCode}: ${failure.error}`);
  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("VITOL sync failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
