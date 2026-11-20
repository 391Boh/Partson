import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";

const directory = path.join(process.cwd(), ".cache", "build-inputs");
const tasks = ["prepare:catalog-inputs", "generate:group-previews", "generate:seo-counts", "generate:auto-model-sitemap", "warm:auto-model-breakdowns"];
if (process.argv.includes("--full")) tasks.push("generate:feed");
mkdirSync(directory, { recursive: true });
const env = { ...process.env, ONEC_RECORD_BUILD_SNAPSHOTS: "1" };
delete env.ONEC_BUILD_SNAPSHOT_ONLY;
for (const task of tasks) {
  console.log(`[sync:catalog] ${task}`);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", task], { stdio: "inherit", env });
    child.once("error", reject); child.once("exit", resolve);
  });
  if (code !== 0) { console.error(`[sync:catalog] ${task} failed; previous snapshots remain available.`); process.exit(1); }
}
const SNAPSHOT_FILE = /^(?:getprod|getauto|getdata|allgoods|getinfo|sale_v1|prices|pricespost|getimages)-[a-f0-9]{64}\.json$/;
const snapshots = readdirSync(directory).filter((name) => SNAPSHOT_FILE.test(name))
  .map((name) => { try { return JSON.parse(readFileSync(path.join(directory, name), "utf8")); } catch { return null; } })
  .filter((saved) => saved?.version === 1 && typeof saved.response?.text === "string");
const endpoints = [...new Set(snapshots.map((saved) => saved.endpoint))];
if (!endpoints.includes("getprod") || !endpoints.includes("getauto")) throw new Error("Synchronization did not produce required getprod/getauto build inputs.");
const temporary = path.join(directory, "manifest.json.tmp");
writeFileSync(temporary, JSON.stringify({ version: 1, completedAt: Date.now(), snapshots: snapshots.length, endpoints }));
renameSync(temporary, path.join(directory, "manifest.json"));
// A snapshot this sync did not refresh is a request the current code no longer
// makes, or one only a live-fallback build recorded. After a week it is stale
// either way; a build that still needs it records it again from live 1C.
const staleBefore = Date.now() - 7 * 24 * 60 * 60 * 1000;
let pruned = 0;
for (const name of readdirSync(directory)) {
  if (!SNAPSHOT_FILE.test(name) && !/^missing-\d+\.jsonl$/.test(name)) continue;
  const file = path.join(directory, name);
  try { if (statSync(file).mtimeMs < staleBefore) { unlinkSync(file); pruned += 1; } } catch {}
}
console.log(`[sync:catalog] ${snapshots.length} prepared request snapshots${pruned ? `, ${pruned} stale removed` : ""}; build is a separate step.`);
