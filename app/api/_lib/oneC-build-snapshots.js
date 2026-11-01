import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const READ_ENDPOINTS = new Set(["getprod", "getauto", "getdata", "allgoods", "getinfo", "sale_v1", "prices", "pricespost", "getimages"]);
const directory = () => process.env.ONEC_BUILD_SNAPSHOT_DIR || path.join(process.cwd(), ".cache", "build-inputs");
const filename = (endpoint, key) => path.join(directory(), `${endpoint}-${createHash("sha256").update(key).digest("hex")}.json`);

export function readBuildSnapshot(endpoint, key) {
  if (!READ_ENDPOINTS.has(endpoint)) return null;
  try {
    const saved = JSON.parse(fs.readFileSync(filename(endpoint, key), "utf8"));
    if (saved.version !== 1 || saved.endpoint !== endpoint || saved.key !== key || !Number.isFinite(saved.savedAt) ||
      !saved.response || saved.response.status < 200 || saved.response.status >= 300 || typeof saved.response.text !== "string") return null;
    return saved.response;
  } catch { return null; }
}

export function recordBuildSnapshot(endpoint, key, response) {
  if (process.env.ONEC_RECORD_BUILD_SNAPSHOTS !== "1" || !READ_ENDPOINTS.has(endpoint) || response.status < 200 || response.status >= 300) return response;
  const file = filename(endpoint, key);
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(directory(), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, endpoint, key, savedAt: Date.now(), response }), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } catch (error) { console.warn(`[build-inputs] Could not save ${endpoint}:`, error?.code || "write failed"); }
  return response;
}

export function missingBuildSnapshot(endpoint, key) {
  const message = `Missing 1C build snapshot for ${endpoint}. Run npm run sync:catalog before building this release.`;
  if (process.env.ONEC_BUILD_MISSING_LOG) {
    try { fs.appendFileSync(process.env.ONEC_BUILD_MISSING_LOG, JSON.stringify({ endpoint, key }) + "\n"); } catch {}
  }
  return { status: 503, contentType: "application/json", text: JSON.stringify({ error: "BUILD_SNAPSHOT_MISSING", message }) };
}
