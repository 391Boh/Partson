// Sync the VITOL supplier feed into 1C as "під замовлення" products.
//
//   npm run vitol:sync                 # dry run: download, price, compare, report
//   npm run vitol:sync -- --apply      # write to 1C (create new, update prices)
//   npm run vitol:sync -- --apply --limit 20      # first 20 new products only
//   npm run vitol:sync -- --file ~/Downloads/vitol.csv   # local CSV instead of the URL
//   npm run vitol:sync -- --no-images  # don't upload photos with new products
//
// Env: VITOL_FEED_URL (export link with token), VITOL_MARKUP_PERCENT (default 0:
// the feed price is VITOL's retail price, and we sell at it),
// VITOL_ONEC_GROUP (top-level 1C group for these products).
// Products are created with quantity 0, so the site shows them "Під замовлення".
// 1C's createproduct ignores prices, so each new product gets its price from a
// follow-up edit call; it also only links producers that already exist, so the
// missing ones are created first.
// Which 1C codes came from VITOL is kept in data/vitol/state.json — only those
// get their prices updated; a VITOL item whose article+producer already exists
// in 1C is left alone (our own stock and pricing win).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

import { oneCRequest } from "../app/api/_lib/oneC";
import { writeCatalogChange } from "../app/lib/catalog-change-log";
import { fetchConfirmedEuroRate, fetchFullCatalogProducts } from "../app/lib/catalog-server";
import {
  VITOL_DEFAULT_MARKUP_PERCENT,
  parseVitolFeed,
  uahToEuro,
  vitolMatchKey,
  vitolRetailUah,
  type VitolFeedItem,
} from "../app/lib/vitol-feed";

type StateEntry = {
  code: string;
  article: string;
  costUah: number;
  retailUah: number;
  priceEuro: number;
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
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
// Re-send a price when the hryvnia price shown on the site drifts this much
// from the target (euro-rate moves), or whenever VITOL changes the cost.
const PRICE_DRIFT_RATIO = 0.01;
const ONEC_GROUP = (process.env.VITOL_ONEC_GROUP || "Автотовари та інструмент").trim();

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const apply = flag("--apply");
const withImages = !flag("--no-images");
const createLimit = Number(option("--limit")) > 0 ? Math.floor(Number(option("--limit"))) : Infinity;
const localFile = option("--file");
const markupPercent = (() => {
  const raw = Number(process.env.VITOL_MARKUP_PERCENT);
  return Number.isFinite(raw) && raw >= 0 ? raw : VITOL_DEFAULT_MARKUP_PERCENT;
})();

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

async function loadFeedText() {
  if (localFile) {
    const path = localFile.replace(/^~(?=\/)/, process.env.HOME || "~");
    if (!existsSync(path)) throw new Error(`Файл не знайдено: ${path}`);
    return readFileSync(path, "utf8");
  }
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
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`VITOL feed HTTP ${response.status}`);
  return response.text();
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

async function createInOneC(item: VitolFeedItem, priceEuro: number, costEuro: number) {
  const body: Record<string, unknown> = {
    Наименование: item.name,
    НомерПоКаталогу: item.article,
    ПроизводительНаименование: item.producer,
    ЦінаПрод: priceEuro,
    ЦінаЗакуп: costEuro,
  };
  if (ONEC_GROUP) body["Группа"] = ONEC_GROUP;
  if (withImages) {
    const image = await downloadImageBase64(item.imageUrl);
    if (image) {
      body.file_name = `${item.article.replace(/[^\w.-]+/g, "_")}.${image.ext}`;
      body.image_base64 = image.base64;
    }
  }
  const result = await oneCRequest(CREATE_ENDPOINT, {
    method: "POST",
    body,
    timeoutMs: 25_000,
    retries: 0,
    cacheTtlMs: 0,
  });
  const parsed = parseOneC(result.text);
  if (result.status < 200 || result.status >= 300 || parsed.success === false) {
    throw new Error(String(parsed.error_message || parsed.message || parsed.error || `HTTP ${result.status}`));
  }
  const code = String(parsed["Код"] || parsed.code || "").trim();
  if (!code) throw new Error("1С не повернула код товару");
  return { code, article: String(parsed["НомерПоКаталогу"] || item.article) };
}

async function adminAction<T>(action: string, params: Record<string, unknown> = {}) {
  const result = await oneCRequest(EDIT_ENDPOINT, {
    method: "POST",
    body: { Дія: action, ...params },
    timeoutMs: 60_000,
    retries: 0,
    cacheTtlMs: 0,
  });
  const parsed = parseOneC(result.text) as Record<string, unknown> & T;
  if (result.status < 200 || result.status >= 300 || parsed.success === false) {
    throw new Error(`${action}: ${String(parsed.error_message || parsed.message || parsed.error || `HTTP ${result.status}`)}`);
  }
  return parsed;
}

const normName = (value: string) => value.trim().toLowerCase();

/** Top-level 1C group the VITOL products go into; created once. */
async function ensureOneCGroup(): Promise<"exists" | "created" | "would-create"> {
  if (!ONEC_GROUP) return "exists";
  const list = await adminAction<{ items?: Array<{ name: string; parent_code: string }> }>("СписокГруп");
  const found = (list.items || []).some((group) => normName(group.name) === normName(ONEC_GROUP) && !group.parent_code);
  if (found) return "exists";
  if (!apply) return "would-create";
  await adminAction("СтворитиГрупу", { Назва: ONEC_GROUP });
  return "created";
}

/** createproduct links a producer only if it already exists in 1C. */
async function ensureOneCProducers(names: string[]) {
  const list = await adminAction<{ items?: Array<{ name: string }> }>("СписокВиробників");
  const known = new Set((list.items || []).map((producer) => normName(producer.name)));
  const missing = [...new Set(names.map((name) => name.trim()).filter(Boolean))].filter(
    (name) => !known.has(normName(name))
  );
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
    throw new Error(String(parsed.error_message || parsed.message || parsed.error || `HTTP ${result.status}`));
  }
}

async function main() {
  const startedAt = new Date();
  console.log(`VITOL sync ${apply ? "APPLY" : "DRY RUN"} · націнка ${markupPercent}% · ${startedAt.toISOString()}`);

  const feed = parseVitolFeed(await loadFeedText());
  console.log(`Фід: ${feed.items.length} товарів, пропущено ${feed.skipped.length}`);
  if (feed.items.length === 0) {
    console.log("У фіді немає товарів — нічого не роблю. Перевірте налаштування експорту в кабінеті VITOL.");
    writeJson(REPORT_FILE, { startedAt, apply, markupPercent, feedItems: 0, skipped: feed.skipped });
    return;
  }

  const euroRate = await fetchConfirmedEuroRate();
  if (!euroRate || !(euroRate > 0)) throw new Error("Немає підтвердженого курсу євро з 1С — зупиняюсь");
  console.log(`Курс євро: ${euroRate}`);

  const groupStatus = await ensureOneCGroup();
  console.log(`Група 1С «${ONEC_GROUP}»: ${groupStatus === "exists" ? "є" : groupStatus === "created" ? "створено" : "буде створено"}`);

  const state = readState();
  // Only producers of the products this run will create (--limit included).
  const newProducers = feed.items
    .filter((item) => !state.items[item.supplierCode])
    .slice(0, createLimit)
    .map((item) => item.producer);
  const producers = await ensureOneCProducers(newProducers);
  console.log(
    `Виробники, яких немає в 1С: ${producers.missing.length}${producers.missing.length ? ` (${producers.missing.slice(0, 12).join(", ")}${producers.missing.length > 12 ? ", …" : ""})` : ""}` +
      (apply ? ` — створено ${producers.missing.length - producers.failed.length}` : " — будуть створені")
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
    euroRate,
    feedItems: feed.items.length,
    skipped: feed.skipped,
    created: [] as Array<{ supplierCode: string; code?: string; article: string; retailUah: number }>,
    updated: [] as Array<{ supplierCode: string; code: string; fromUah: number; toUah: number }>,
    alreadyInOneC: [] as Array<{ supplierCode: string; article: string; code: string }>,
    failed: [] as Array<{ supplierCode: string; action: string; error: string }>,
    unchanged: 0,
    goneFromFeed: [] as string[],
  };

  let createdCount = 0;
  for (const item of feed.items) {
    const retailUah = vitolRetailUah(item.costUah, markupPercent);
    const priceEuro = uahToEuro(retailUah, euroRate);
    const costEuro = uahToEuro(item.costUah, euroRate);
    const known = state.items[item.supplierCode];

    if (known) {
      if (!(known.priceEuro > 0)) {
        report.updated.push({ supplierCode: item.supplierCode, code: known.code, fromUah: 0, toUah: retailUah });
        if (!apply) continue;
        try {
          await updatePriceInOneC(known, priceEuro, costEuro);
          state.items[item.supplierCode] = { ...known, costUah: item.costUah, retailUah, priceEuro, syncedAt: new Date().toISOString() };
        } catch (error) {
          report.failed.push({ supplierCode: item.supplierCode, action: "price", error: String((error as Error).message) });
        }
        continue;
      }
      const shownUah = Math.round(known.priceEuro * euroRate);
      const drift = Math.abs(shownUah - retailUah) / retailUah;
      if (known.costUah === item.costUah && drift <= PRICE_DRIFT_RATIO) {
        report.unchanged += 1;
        continue;
      }
      report.updated.push({ supplierCode: item.supplierCode, code: known.code, fromUah: shownUah, toUah: retailUah });
      if (!apply) continue;
      try {
        await updatePriceInOneC(known, priceEuro, costEuro);
        state.items[item.supplierCode] = { ...known, costUah: item.costUah, retailUah, priceEuro, syncedAt: new Date().toISOString() };
      } catch (error) {
        report.failed.push({ supplierCode: item.supplierCode, action: "update", error: String((error as Error).message) });
      }
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
      report.created.push({ supplierCode: item.supplierCode, article: item.article, retailUah });
      continue;
    }
    try {
      const created = await createInOneC(item, priceEuro, costEuro);
      const entry: StateEntry = {
        code: created.code,
        article: created.article,
        costUah: item.costUah,
        retailUah,
        // 0 until the price write succeeds, so the next run retries it.
        priceEuro: 0,
        syncedAt: new Date().toISOString(),
      };
      state.items[item.supplierCode] = entry;
      try {
        await updatePriceInOneC(entry, priceEuro, costEuro);
        entry.priceEuro = priceEuro;
      } catch (error) {
        report.failed.push({ supplierCode: item.supplierCode, action: "price", error: String((error as Error).message) });
      }
      report.created.push({ supplierCode: item.supplierCode, code: created.code, article: created.article, retailUah });
      // Save as we go: a crash mid-run must not lose which codes we created.
      if (createdCount % 10 === 0) writeJson(STATE_FILE, state);
    } catch (error) {
      report.failed.push({ supplierCode: item.supplierCode, action: "create", error: String((error as Error).message) });
    }
  }

  const inFeed = new Set(feed.items.map((item) => item.supplierCode));
  report.goneFromFeed = Object.keys(state.items).filter((supplierCode) => !inFeed.has(supplierCode));

  if (apply) writeJson(STATE_FILE, state);
  writeJson(REPORT_FILE, report);

  // One journal entry per run that changed something (Каталог → Журнал змін).
  const createdProducers = producers.missing.length - producers.failed.length;
  if (apply && (report.created.length || report.updated.length || report.failed.length || createdProducers)) {
    const priceChanges = report.updated.filter((entry) => entry.fromUah > 0);
    await writeCatalogChange({
      action: "supplier.sync",
      actor: "VITOL",
      target: ONEC_GROUP,
      count: report.created.length + report.updated.length,
      details: [
        report.created.length ? `створено товарів: ${report.created.length}` : "",
        report.updated.length ? `оновлено цін: ${report.updated.length}` : "",
        createdProducers ? `нові виробники: ${producers.missing.filter((name) => !producers.failed.includes(name)).join(", ")}` : "",
        report.failed.length ? `помилок: ${report.failed.length}` : "",
        priceChanges.length
          ? `напр. ${priceChanges.slice(0, 3).map((entry) => `${entry.code} ${entry.fromUah}→${entry.toUah} грн`).join(", ")}`
          : "",
      ].filter(Boolean).join(" · "),
    }).catch((error) => console.warn("Журнал змін не записано:", error instanceof Error ? error.message : error));
  }

  console.log(
    [
      `${apply ? "Створено" : "Буде створено"}: ${report.created.length}${createLimit < Infinity ? ` (ліміт ${createLimit})` : ""}`,
      `${apply ? "Оновлено ціни" : "Буде оновлено ціни"}: ${report.updated.length}`,
      `Без змін: ${report.unchanged}`,
      `Вже є в 1С (не чіпаю): ${report.alreadyInOneC.length}`,
      `Зникли з фіду: ${report.goneFromFeed.length}`,
      `Помилки: ${report.failed.length}`,
      `Звіт: ${REPORT_FILE}`,
    ].join("\n")
  );
  for (const sample of report.created.slice(0, 5)) {
    console.log(`  + ${sample.article} → ${sample.retailUah} грн`);
  }
  for (const failure of report.failed.slice(0, 10)) {
    console.log(`  ! ${failure.action} ${failure.supplierCode}: ${failure.error}`);
  }
  if (report.failed.length > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error("VITOL sync failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  });
