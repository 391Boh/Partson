import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readIndexNowUrls } from "./lib/indexnow-input.mjs";

const directory = await mkdtemp(path.join(tmpdir(), "partson-indexnow-"));
try {
  const file = path.join(directory, "new-arrival-urls.txt");
  await writeFile(file, "\uFEFF# Verified live canonical URLs\r\n/product/new-1\r\nhttps://partson.shop/product/new-2\n\n/product/new-1#photo\n");
  assert.deepEqual(await readIndexNowUrls(["--file", file, "/groups/inshe"], "https://partson.shop"), [
    "https://partson.shop/product/new-1", "https://partson.shop/product/new-2", "https://partson.shop/groups/inshe",
  ]);
  for (const foreign of ["https://elsewhere.test/product/1", "//elsewhere.test/", "ftp://partson.shop/a", "https://user:pass@partson.shop/a"]) {
    await assert.rejects(readIndexNowUrls([foreign], "https://partson.shop"), /must belong/);
  }
  await assert.rejects(readIndexNowUrls(["--file"], "https://partson.shop"), /requires/);
  await assert.rejects(readIndexNowUrls(["--unknown"], "https://partson.shop"), /Unknown/);
  await assert.rejects(readIndexNowUrls([], "https://partson.shop"), /Pass canonical/);
  console.log("PASS IndexNow: batch files, BOM/CRLF, deduplication, fragment removal, same-origin validation and input errors.");
} finally { await rm(directory, { recursive: true, force: true }); }
