import "server-only";

import { open, readdir, unlink } from "node:fs/promises";
import path from "node:path";

// nginx keeps product photos (location /product-image/ in the server's
// partson.conf) for days. Without a purge module the only way to retire a
// replaced photo is to delete its entries: each cache file starts with a
// header block holding a "KEY: <scheme><host><uri>|<format>" line.
const CACHE_DIR = process.env.NGINX_PRODUCT_IMAGE_CACHE_DIR || "/var/cache/nginx/partson-images";
const HEADER_BYTES = 1024;

async function* cacheFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* cacheFiles(full);
    else if (entry.isFile()) yield full;
  }
}

async function readKey(file: string) {
  const handle = await open(file, "r").catch(() => null);
  if (!handle) return "";
  try {
    const buffer = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0);
    const header = buffer.toString("latin1", 0, bytesRead);
    const start = header.indexOf("\nKEY: ");
    if (start < 0) return "";
    const end = header.indexOf("\n", start + 6);
    return header.slice(start + 6, end < 0 ? undefined : end);
  } finally {
    await handle.close();
  }
}

/** Removes every cached nginx response for these product codes/articles. */
export async function purgeNginxProductImageCache(codes: Array<string | undefined>) {
  const prefixes = [...new Set(codes.map((code) => (code || "").trim()).filter(Boolean))]
    .flatMap((code) => {
      const encoded = encodeURIComponent(code);
      return [...new Set([encoded, code])].map((value) => `/product-image/${value}`.toLowerCase());
    });
  if (!prefixes.length) return 0;
  let removed = 0;
  for await (const file of cacheFiles(CACHE_DIR)) {
    const key = (await readKey(file)).toLowerCase();
    const match = prefixes.some((prefix) => {
      const at = key.indexOf(prefix);
      if (at < 0) return false;
      const next = key.charAt(at + prefix.length);
      return next === "" || next === "?" || next === "/" || next === "|";
    });
    if (match && (await unlink(file).then(() => true, () => false))) removed += 1;
  }
  return removed;
}
