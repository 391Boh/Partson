import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const code = ts.transpileModule(readFileSync("app/lib/manufacturer-counts-client.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const valid = { clientProducers: [{ label: "4MAX", productCount: 23, groupsCount: 1 }] };
function fixture(fetchResponse) {
  const exports = {}, timers = new Map();
  let calls = 0;
  vm.runInNewContext(code, {
    exports, AbortController,
    fetch: (...args) => { calls++; return fetchResponse(calls, ...args); },
    setTimeout: callback => { const id = timers.size + 1; timers.set(id, callback); return id; },
    clearTimeout: id => timers.delete(id),
  });
  return { ...exports, timers, calls: () => calls };
}
for (const failure of ["http", "network", "json", "shape", "timeout"]) {
  const api = fixture(async (call, _url, options) => {
    if (call > 1) return { ok: true, json: async () => valid };
    if (failure === "network") throw new Error("offline");
    if (failure === "timeout") return new Promise((_, reject) => {
      options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
    return { ok: failure !== "http", json: async () => {
      if (failure === "json") throw new Error("invalid JSON");
      return {};
    } };
  });
  const first = api.prefetchManufacturerCounts();
  assert.equal(api.getManufacturerCounts(), first, "Prefetch and the picker share one request");
  if (failure === "timeout") for (const callback of api.timers.values()) callback();
  assert.equal(await first, null, failure);
  assert.equal(api.timers.size, 0, "Failures clean up their timeout");
  assert.equal((await api.getManufacturerCounts()).clientProducers[0].productCount, 23);
  await api.prefetchManufacturerCounts();
  assert.equal(api.calls(), 2, "A failed warmup is retried, and a successful result is cached");
  assert.equal(api.timers.size, 0);
}
console.log("PASS manufacturer loading: shared requests, timeout, HTTP/network/JSON recovery and successful-result reuse.");
