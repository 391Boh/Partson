import { fetchProductImageBase64 } from "../app/lib/product-image";

const TEST_KEYS: Array<{ label: string; code: string; article: string }> = [
  { label: "Трос AD030213", code: "00-00000056", article: "AD030213" },
  { label: "Фільтр AF5323", code: "РТ-00001541", article: "AF5323" },
];

async function main() {
  console.log("ONEC_BASE_URL:", process.env.ONEC_BASE_URL || "(not set)");
  console.log(
    "ONEC_IMAGE_BATCH_ENDPOINT:",
    process.env.ONEC_IMAGE_BATCH_ENDPOINT || "(not set, using default)"
  );
  console.log(
    "ONEC_GETIMAGES_BATCH_ENDPOINT:",
    process.env.ONEC_GETIMAGES_BATCH_ENDPOINT || "(not set, using default)"
  );
  console.log("");

  for (const test of TEST_KEYS) {
    for (const key of [test.code, test.article]) {
      const startedAt = Date.now();
      try {
        const result = await fetchProductImageBase64(key, {
          timeoutMs: 8000,
          retries: 0,
          allowUrlDownload: true,
          skipMissCache: true,
        } as any);
        const elapsedMs = Date.now() - startedAt;
        console.log(
          `[${test.label}] key="${key}" -> ${
            result ? `OK, ${result.length} base64 chars` : "NULL (no image)"
          } (${elapsedMs}ms)`
        );
      } catch (error) {
        const elapsedMs = Date.now() - startedAt;
        console.log(
          `[${test.label}] key="${key}" -> THREW: ${
            (error as Error)?.message || error
          } (${elapsedMs}ms)`
        );
      }
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Fatal:", error);
    process.exit(1);
  });
