/**
 * Перевірка адмін-дій каталогу в 1С (лише читання, нічого не змінює).
 * Запуск: node scripts/test-1c-admin-actions.mjs
 *
 * Якщо 1С відповідає «Не передан Код», у базі ще старий модуль
 * ОбщегоНазначения: списки груп/виробників, перейменування групи й
 * додавання виробника на сайті працюватимуть лише після його оновлення.
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(ROOT, ".env.local"), "utf-8")
    .split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)\s*=\s*(.*)/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "").trim()])
);
const BASE_URL = env.ONEC_BASE_URL.replace(/\/$/, "");
const ENDPOINT = (env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").replace(/^\//, "");

for (const action of ["СписокГруп", "СписокВиробників"]) {
  const startedAt = Date.now();
  let status = "—";
  let summary = "";
  try {
    const res = await fetch(`${BASE_URL}/${ENDPOINT}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.ONEC_AUTH_HEADER },
      body: JSON.stringify({ Дія: action }),
      signal: AbortSignal.timeout(20_000),
    });
    status = String(res.status);
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      summary = json.success === true
        ? `OK: ${Array.isArray(json.items) ? json.items.length : 0} записів, напр. ${JSON.stringify((json.items || []).slice(0, 2))}`
        : `ПОМИЛКА: ${[json.error_message, json.details].filter(Boolean).join(": ")}`;
      if (/Не передан Код/i.test(summary)) summary += "  ← у 1С старий модуль, потрібне оновлення";
    } catch {
      summary = `не JSON: ${text.slice(0, 200)}`;
    }
  } catch (error) {
    summary = `немає відповіді: ${error.message}`;
  }
  console.log(`${action}: HTTP ${status}, ${Date.now() - startedAt} мс — ${summary}`);
}
