/**
 * Тест завантаження фото в 1С.
 * Запуск: node scripts/test-1c-image.mjs <код_товару> <шлях_до_фото>
 * Приклад: node scripts/test-1c-image.mjs 00-00000079 /Users/me/photo.jpg
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── завантажити .env.local ──────────────────────────────────────────────────
function loadEnv() {
  const envFile = join(ROOT, ".env.local");
  const lines = readFileSync(envFile, "utf-8").split("\n");
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return env;
}

// ── основна логіка ─────────────────────────────────────────────────────────
const env = loadEnv();
const BASE_URL = env.ONEC_BASE_URL;
const AUTH = env.ONEC_AUTH_HEADER;

if (!BASE_URL || !AUTH) {
  console.error("ONEC_BASE_URL або ONEC_AUTH_HEADER не знайдено в .env.local");
  process.exit(1);
}

const CODE = process.argv[2];
const IMAGE_PATH = process.argv[3];

if (!CODE || !IMAGE_PATH) {
  console.error("Використання: node scripts/test-1c-image.mjs <код_товару> <шлях_до_фото>");
  console.error("Приклад:      node scripts/test-1c-image.mjs 00-00000079 /Users/me/photo.jpg");
  process.exit(1);
}

if (!existsSync(IMAGE_PATH)) {
  console.error(`Файл не знайдено: ${IMAGE_PATH}`);
  process.exit(1);
}

const imageBuffer = readFileSync(IMAGE_PATH);
const imageBase64 = imageBuffer.toString("base64");
const fileName = basename(IMAGE_PATH);

// Той самий endpoint що й product-update (edit) і product-upload-image
const ENDPOINT = (env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").replace(/^\//, "");
const URL = `${BASE_URL.replace(/\/$/, "")}/${ENDPOINT}`;

const body = JSON.stringify({
  Код: CODE,
  file_name: fileName,
  image_base64: imageBase64,
});

console.log("────────────────────────────────────────");
console.log(`Endpoint  : ${URL}`);
console.log(`Код       : ${CODE}`);
console.log(`file_name : ${fileName}`);
console.log(`Розмір    : ${(imageBuffer.length / 1024).toFixed(1)} KB`);
console.log(`Base64 len: ${imageBase64.length} символів`);

console.log("────────────────────────────────────────\n");

const res = await fetch(URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: AUTH,
  },
  body,
});

const text = await res.text();
console.log(`← HTTP ${res.status} ${res.statusText}`);
console.log("← Відповідь 1С:\n");
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}
