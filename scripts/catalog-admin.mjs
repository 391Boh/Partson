// Runs one 1C catalog admin action (ВыполнитьАдминДию in ОбщегоНазначения)
// through the edit endpoint and prints the JSON reply.
//   node --env-file=.env.local scripts/catalog-admin.mjs '{"Дія":"СписокГруп"}'
//   node --env-file=.env.local scripts/catalog-admin.mjs @body.json
import { readFileSync } from "node:fs";

const arg = process.argv[2] || "";
const body = arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg;
JSON.parse(body);
const base = (process.env.ONEC_BASE_URL || "").replace(/\/$/, "");
const endpoint = (process.env.ONEC_PRODUCT_UPDATE_ENDPOINT || "edit").replace(/^\//, "");
if (!base || !process.env.ONEC_AUTH_HEADER) throw new Error("1C connection is not configured");
const response = await fetch(`${base}/${endpoint}`, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8", Authorization: process.env.ONEC_AUTH_HEADER },
  body,
  signal: AbortSignal.timeout(600_000),
});
process.stdout.write(await response.text());
