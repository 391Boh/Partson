import { readFile } from "node:fs/promises";

/** A text file avoids command-line size limits for a whole supplier import. */
export async function readIndexNowUrls(args, siteUrl) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    const value = args[index].trim();
    if (value === "--file") {
      const filename = args[++index];
      if (!filename) throw new Error("--file requires a UTF-8 URL list");
      values.push(...(await readFile(filename, "utf8")).replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#")));
    } else if (value.startsWith("--")) {
      throw new Error(`Unknown IndexNow option: ${value}`);
    } else if (value) values.push(value);
  }
  if (!values.length) throw new Error("Pass canonical URLs or --file urls.txt");
  const origin = new URL(siteUrl).origin;
  return [...new Set(values.map(value => {
    const url = new URL(value, `${siteUrl}/`);
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.username || url.password) {
      throw new Error(`IndexNow URL must belong to ${origin}: ${value}`);
    }
    url.hash = "";
    return url.toString();
  }))];
}
