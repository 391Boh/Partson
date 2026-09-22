import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

// Execute the real server pipeline with an injected 1C transport. No Next.js
// process or credentials are needed for the regression suite.
export function loadCatalogSearch(oneCRequest) {
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = readFileSync(file, "utf8");
    const code = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, process: { env: {} }, console, setTimeout, clearTimeout, Buffer,
      require: (name) => {
        if (name === "server-only") return {};
        if (name === "app/api/_lib/oneC") return { oneCRequest };
        if (name === "app/lib/product-tree") return { getProductTreeDataset: async () => ({}) };
        const target = name.startsWith("app/") ? path.join(root, name) : path.resolve(path.dirname(file), name);
        return load(target + ".ts");
      },
    }, { filename: file });
    return exports;
  }
  return {
    ...load(path.join(root, "app/lib/catalog-search.ts")),
    ...load(path.join(root, "app/lib/catalog-server.ts")),
  };
}
