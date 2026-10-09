#!/usr/bin/env node
// Keeps Next.js's on-disk ISR response cache (.next/server/route-cache) within
// a size and age budget. Next 16 writes every rendered or revalidated page
// there (incremental-cache/file-system-cache.js, ROUTE_CACHE_DIRECTORY) and
// copies build-time prerenders into it on first read ("promoteSeed"), but
// never deletes anything — a crawl of ~3.7k pages added ~1.6 GB on a server
// with a few GB of disk. Entries are rebuildable: when a primary file is
// missing Next falls back to the build seed in .next/server/app or re-renders,
// and any read error is treated as a cache miss.
//
// An entry is `<base>.html` (`<base>.body` for route handlers) plus its
// `.meta`, `.rsc`, `.json` and `<base>.segments/` siblings. Removal is NOT
// atomic: the primary file goes first (a reader then sees a miss), the
// siblings after it. Concurrent Next.js writes are handled conservatively:
//   - an entry whose primary file changed since the scan, or was written in
//     the last --min-age-seconds, is skipped (Next is (re)writing it);
//   - siblings without a primary ("orphans") are reported separately and only
//     removed once older than --orphan-grace-minutes, because Next writes
//     siblings before the primary (promoteSeed) or in parallel with it (set);
//   - a sibling Next rewrites just after the primary was removed can leave a
//     short-lived orphan or a primary without siblings: both read as a miss
//     and are overwritten by the next render, the orphan sweep collects leftovers.
// A lock file prevents two runs from working on the same directory.
//
// Usage: node scripts/prune-route-cache.mjs [--dir <release>/.next/server/route-cache]
//          [--max-mb 600] [--max-age-hours 48] [--min-age-seconds 120]
//          [--orphan-grace-minutes 60] [--dry-run]
// Exit codes: 0 ok (also "another run holds the lock"), 1 some removals failed,
//             2 invalid arguments or path, 3 cache directory missing/unreadable.

import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const log = (message) => console.log(`[prune-route-cache] ${new Date().toISOString()} ${message}`);
const fail = (code, message) => {
  console.error(`[prune-route-cache] ${new Date().toISOString()} ERROR ${message}`);
  process.exit(code);
};

const dryRun = args.includes("--dry-run");
const dir = resolve(option("dir", join(process.cwd(), ".next", "server", "route-cache")));
const maxBytes = Number(option("max-mb", "600")) * 1024 * 1024;
const maxAgeMs = Number(option("max-age-hours", "48")) * 3600 * 1000;
const minAgeMs = Number(option("min-age-seconds", "120")) * 1000;
const orphanGraceMs = Number(option("orphan-grace-minutes", "60")) * 60 * 1000;

if (!dir.endsWith(`${sep}.next${sep}server${sep}route-cache`)) {
  fail(2, `refusing: ${dir} is not a .next/server/route-cache directory`);
}
if (![maxBytes, maxAgeMs, minAgeMs, orphanGraceMs].every((value) => Number.isFinite(value) && value >= 0) || maxBytes <= 0) {
  fail(2, "--max-mb must be > 0; --max-age-hours, --min-age-seconds, --orphan-grace-minutes must be >= 0");
}
try {
  if (!statSync(dir).isDirectory()) fail(3, `${dir} is not a directory`);
  readdirSync(dir);
} catch (error) {
  fail(3, `cache directory unavailable: ${dir} (${error.code || error.message})`);
}

// --- lock (one run per directory; stale locks from dead processes are taken over)
const lockPath = join(dirname(dir), "route-cache.prune.lock");
const isAlive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
};
const acquireLock = () => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(lockPath, "wx");
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") fail(3, `cannot create lock ${lockPath} (${error.code})`);
      const holder = Number(readFileSync(lockPath, "utf8").trim());
      if (Number.isInteger(holder) && holder > 0 && isAlive(holder)) return false;
      rmSync(lockPath, { force: true }); // stale: holder is gone
    }
  }
  return false;
};
if (!acquireLock()) {
  log(`skipped: another run holds ${lockPath}`);
  process.exit(0);
}
const releaseLock = () => rmSync(lockPath, { force: true });
process.on("exit", releaseLock);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => process.exit(130));

// --- scan
const PRIMARY = /\.(html|body)$/;
const SIBLING = /\.(meta|rsc|json)$/;
const SIBLING_SUFFIXES = [".meta", ".rsc", ".json"];

const sizeOf = (path) => {
  try {
    const stat = lstatSync(path);
    if (!stat.isDirectory()) return stat.size;
    return readdirSync(path).reduce((sum, name) => sum + sizeOf(join(path, name)), 0);
  } catch {
    return 0;
  }
};
const mtimeOf = (path) => {
  try {
    return lstatSync(path).mtimeMs;
  } catch {
    return null;
  }
};

const scan = () => {
  const primaries = new Map(); // base -> primary path
  const siblings = []; // { path, base }
  const walk = (current) => {
    let items;
    try {
      items = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      const path = join(current, item.name);
      if (item.isDirectory()) {
        if (item.name.endsWith(".segments")) siblings.push({ path, base: path.slice(0, -".segments".length) });
        else walk(path);
      } else if (PRIMARY.test(item.name)) {
        primaries.set(path.replace(PRIMARY, ""), path);
      } else if (SIBLING.test(item.name)) {
        siblings.push({ path, base: path.replace(SIBLING, "") });
      }
    }
  };
  walk(dir);
  return { primaries, siblings };
};

const { primaries, siblings } = scan();
const now = Date.now();
const entries = [];
for (const [base, path] of primaries) {
  const mtimeMs = mtimeOf(path);
  if (mtimeMs === null) continue;
  const parts = [path, ...SIBLING_SUFFIXES.map((suffix) => base + suffix), `${base}.segments`];
  entries.push({ path, parts, mtimeMs, bytes: parts.reduce((sum, part) => sum + sizeOf(part), 0) });
}
const orphans = siblings
  .filter((sibling) => !primaries.has(sibling.base))
  .map((sibling) => ({ ...sibling, mtimeMs: mtimeOf(sibling.path) ?? now, bytes: sizeOf(sibling.path) }));

const entryBytes = entries.reduce((sum, entry) => sum + entry.bytes, 0);
const orphanBytes = orphans.reduce((sum, orphan) => sum + orphan.bytes, 0);

// --- select: too old first, then oldest until the size budget fits
entries.sort((a, b) => a.mtimeMs - b.mtimeMs);
let projected = entryBytes + orphanBytes;
const victims = [];
for (const entry of entries) {
  const tooOld = now - entry.mtimeMs > maxAgeMs;
  if (!tooOld && projected <= maxBytes) break;
  victims.push(entry);
  projected -= entry.bytes;
}
const staleOrphans = orphans.filter((orphan) => now - orphan.mtimeMs > orphanGraceMs);

// --- remove
let removed = 0;
let skippedBusy = 0;
let failed = 0;
let orphansRemoved = 0;
if (!dryRun) {
  for (const entry of victims) {
    const current = mtimeOf(entry.path);
    if (current === null) continue; // already gone (Next or another cleaner)
    if (current !== entry.mtimeMs || Date.now() - current < minAgeMs) {
      skippedBusy += 1; // Next rewrote it since the scan / is writing it
      continue;
    }
    try {
      unlinkSync(entry.path);
    } catch (error) {
      if (error.code !== "ENOENT") {
        failed += 1;
        console.error(`[prune-route-cache] failed to remove ${entry.path}: ${error.code}`);
      }
      continue;
    }
    for (const part of entry.parts.slice(1)) {
      try {
        rmSync(part, { recursive: true, force: true });
      } catch (error) {
        failed += 1;
        console.error(`[prune-route-cache] failed to remove ${part}: ${error.code}`);
      }
    }
    removed += 1;
  }
  for (const orphan of staleOrphans) {
    if (mtimeOf(`${orphan.base}.html`) !== null || mtimeOf(`${orphan.base}.body`) !== null) continue; // primary appeared
    try {
      rmSync(orphan.path, { recursive: true, force: true });
      orphansRemoved += 1;
    } catch (error) {
      failed += 1;
      console.error(`[prune-route-cache] failed to remove orphan ${orphan.path}: ${error.code}`);
    }
  }
}

// --- measure what is actually on disk now
const after = scan();
const afterOrphans = after.siblings.filter((sibling) => !after.primaries.has(sibling.base));
const afterBytes = sizeOf(dir);
const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

log(
  `${dryRun ? "DRY-RUN " : ""}dir=${dir} before: entries=${entries.length} ${mb(entryBytes)}MB ` +
    `orphans=${orphans.length} ${mb(orphanBytes)}MB | selected=${victims.length} ` +
    `removed=${removed} skippedBusy=${skippedBusy} orphansRemoved=${orphansRemoved} ` +
    `(stale orphans ${staleOrphans.length}) failed=${failed} | projected=${mb(projected)}MB | after (measured): ` +
    `entries=${after.primaries.size} orphans=${afterOrphans.length} total=${mb(afterBytes)}MB ` +
    `limit=${mb(maxBytes)}MB maxAge=${maxAgeMs / 3600000}h`
);
process.exitCode = failed > 0 ? 1 : 0;
