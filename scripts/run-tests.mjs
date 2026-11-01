import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { suites } from "./test-suites.mjs";

const suite = process.argv[2] || "unit";
if (!suites[suite]) throw new Error(`Unknown test suite: ${suite}`);
if (suite === "smoke" && !process.env.TEST_ORIGIN) throw new Error("Set TEST_ORIGIN to an explicitly chosen preview server for smoke tests.");
const browserProvider = new URL("./test-browser.mjs", import.meta.url).href;
const failures = [];
const started = Date.now();
for (const script of suites[suite]) {
  if (!existsSync(script)) throw new Error(`Missing regression test: ${script}`);
  const browser = suite !== "unit";
  console.log(`\n[test:${suite}] ${script}`);
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", script, ...(browser ? [browserProvider] : [])], {
      stdio: "inherit", detached: process.platform !== "win32",
      env: { ...process.env, PROFILE_APPEARANCE_SMOKE: process.env.PROFILE_APPEARANCE_SMOKE ?? "1", UI_SMOKE: process.env.UI_SMOKE ?? "1" },
    });
    let timedOut = false;
    const stop = () => {
      timedOut = true;
      if (process.platform !== "win32") { try { process.kill(-child.pid, "SIGTERM"); } catch {} }
      else child.kill("SIGTERM");
    };
    const timer = setTimeout(stop, Number(process.env.TEST_TIMEOUT_MS) || (browser ? 120_000 : 45_000));
    child.once("error", (error) => { clearTimeout(timer); resolve({ code: 1, error: error.message }); });
    child.once("exit", (code) => { clearTimeout(timer); resolve({ code: timedOut ? 1 : code ?? 1, timedOut }); });
  });
  if (result.code !== 0) failures.push({ script, ...result });
}
console.log(`\n[test:${suite}] ${suites[suite].length - failures.length}/${suites[suite].length} passed in ${Math.round((Date.now() - started) / 1000)}s`);
if (failures.length) { console.error(failures); process.exitCode = 1; }
