/**
 * Тест оновлення товару в 1С (edit endpoint).
 * Запуск: node scripts/test-1c-edit.mjs [код] [поле=значення ...]
 *
 * Приклади:
 *   node scripts/test-1c-edit.mjs 00-00000079
 *   node scripts/test-1c-edit.mjs 00-00000079 Группа="Гальмівна система"
 *   node scripts/test-1c-edit.mjs 00-00000079 Категория="Запчастини" Группа="Гальмо"
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadEnv() {
  const lines = readFileSync(join(ROOT, ".env.local"), "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

const env = loadEnv();
const BASE_URL = env.ONEC_BASE_URL.replace(/\/$/, "");
const AUTH = env.ONEC_AUTH_HEADER;
const ENDPOINT = (env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").replace(/^\//, "");

const code = process.argv[2] || "00-00000079";

// Parse extra args: key=value
const extra = {};
for (const arg of process.argv.slice(3)) {
  const eq = arg.indexOf("=");
  if (eq > 0) extra[arg.slice(0, eq)] = arg.slice(eq + 1);
}

const body = { Код: code, ...extra };

const url = `${BASE_URL}/${ENDPOINT}`;
console.log("────────────────────────────────────────");
console.log(`Endpoint: ${url}`);
console.log("Тіло запиту:");
console.log(JSON.stringify(body, null, 2));
console.log("────────────────────────────────────────\n");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log(`← HTTP ${res.status}`);
console.log("← Відповідь 1С:\n");
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
