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
const CODE = process.argv[2] || "00-00000079";

const url = `${BASE_URL}/getimages`;
console.log(`GET images: ${url}`);
console.log(`Код: ${CODE}\n`);

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({ codes: [CODE] }),
});

const text = await res.text();
console.log(`← HTTP ${res.status}`);
try {
  const json = JSON.parse(text);
  // Скорочено виводимо base64 щоб не забити термінал
  const shrink = (obj) => {
    if (typeof obj === "string" && obj.length > 60) return obj.slice(0, 60) + `…[${obj.length} chars]`;
    if (Array.isArray(obj)) return obj.map(shrink);
    if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k,shrink(v)]));
    return obj;
  };
  console.log(JSON.stringify(shrink(json), null, 2));
} catch {
  console.log(text.slice(0, 500));
}
