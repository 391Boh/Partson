import { spawn } from "node:child_process";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function prepareSnapshotBuild({ root = process.cwd(), compileOnly = false } = {}) {
  const directory = path.join(root, ".cache", "build-inputs");
  mkdirSync(directory, { recursive: true });
  if (!compileOnly) {
    const file = path.join(directory, "manifest.json");
    if (!existsSync(file)) throw new Error("No prepared 1C input snapshots. Run npm run sync:catalog before npm run build.");
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (manifest.version !== 1 || !manifest.snapshots || !manifest.endpoints?.includes("getprod") || !manifest.endpoints?.includes("getauto")) {
      throw new Error("Incomplete 1C input snapshots. Run npm run sync:catalog before npm run build.");
    }
  }
  const previews = path.join(root, "app", "generated", "group-preview-manifest.ts");
  if (!existsSync(previews)) {
    if (!compileOnly) throw new Error("Missing group preview manifest. Run npm run sync:catalog.");
    mkdirSync(path.dirname(previews), { recursive: true });
    writeFileSync(previews, "const groupPreviewManifest: Record<string, string> = {};\nexport default groupPreviewManifest;\n");
  }
  const missingLog = path.join(directory, `missing-${process.pid}.jsonl`);
  writeFileSync(missingLog, "");
  return { missingLog, env: { ...process.env, ONEC_BUILD_SNAPSHOT_ONLY: "1", ONEC_BUILD_MISSING_LOG: missingLog } };
}

const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...args], { stdio: "inherit", env });
  child.once("error", reject);
  child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`next ${args.join(" ")} failed (${code})`)));
});

async function main() {
  const compileOnly = process.argv.includes("--compile");
  const { env, missingLog } = prepareSnapshotBuild({ compileOnly });
  await run(["build", ...(compileOnly ? ["--experimental-build-mode", "compile"] : [])], env);
  const missing = readFileSync(missingLog, "utf8").trim();
  if (missing && !compileOnly) {
    const endpoints = [...new Set(missing.split("\n").map((line) => JSON.parse(line).endpoint))];
    throw new Error(`Build used missing 1C inputs (${endpoints.join(", ")}); release rejected. Refresh snapshots with npm run sync:catalog.`);
  }
  if (compileOnly) await run(["build", "--experimental-build-mode", "generate-env"], env);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[build] ${error.message}. Build from prepared snapshots; sync:catalog performs live synchronization separately.`); process.exitCode = 1; });
}
