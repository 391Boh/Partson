import { existsSync } from "node:fs";
import { chromium as installedChromium, webkit, firefox } from "@playwright/test";

// Existing fixtures accept their browser provider as argv[2]. Use the bundled
// engine in CI and keep installed Chrome as a local fallback.
export const chromium = new Proxy(installedChromium, {
  get(target, key) {
    if (key === "launch") return (options = {}) => {
      const channel = process.env.TEST_BROWSER_CHANNEL;
      const bundled = channel === "chromium" || (!channel && existsSync(target.executablePath()));
      const settings = { ...options };
      if (bundled) delete settings.channel;
      else if (channel) settings.channel = channel;
      return target.launch(settings);
    };
    const value = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
export { webkit, firefox };
