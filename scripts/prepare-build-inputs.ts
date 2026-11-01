import { oneCRequest } from "../app/api/_lib/oneC";
import { getProductTreeNodesUncached } from "../app/lib/product-tree";
import { AUTO_FIELDS } from "../app/components/autoFields";

// Fail before the long generators if live inputs cannot be prepared. Record
// the same keys used by storefront rendering, without mutating the 1C service.
async function main() {
  const tree = await oneCRequest("getprod", { method: "POST", body: {}, retries: 0, timeoutMs: 10_000, cacheTtlMs: 60_000 });
  if (tree.status < 200 || tree.status >= 300) throw new Error(`1C getprod returned ${tree.status}; check access/configuration and retry sync:catalog.`);
  await getProductTreeNodesUncached(); // Also reject malformed or empty 2xx responses.
  const auto = await oneCRequest("getauto", { method: "POST", body: { [AUTO_FIELDS.brand]: "AUDI" }, retries: 0, timeoutMs: 10_000 });
  if (auto.status < 200 || auto.status >= 300) throw new Error(`1C getauto returned ${auto.status}; check access/configuration and retry sync:catalog.`);
  console.log("[build-inputs] category and vehicle sources are available");
}

main().catch((error) => { console.error(`[build-inputs] ${error.message}`); process.exitCode = 1; });
