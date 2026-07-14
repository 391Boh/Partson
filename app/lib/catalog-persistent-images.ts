import "server-only";

import { buildProductImageBatchKey, buildProductImagePath } from "app/lib/product-image-path";
import {
  buildPersistentCatalogRouteImageKey,
  hasPersistentRouteImage,
} from "app/lib/product-image-route-cache";

type CatalogImageItem = {
  code?: string;
  article?: string;
  hasPhoto?: boolean;
};

export const resolvePersistentCatalogImageMap = async (
  items: CatalogImageItem[]
) => {
  const candidates = items
    .filter((item) => item.hasPhoto === true)
    .map((item) => {
      const code = (item.code || "").trim();
      const article = (item.article || "").trim();
      const key = buildProductImageBatchKey(code, article);
      return { code, article, key };
    })
    .filter((item) => item.code && item.key);

  const resolved = await Promise.all(
    candidates.map(async (item) => ({
      ...item,
      ready: await hasPersistentRouteImage(
        buildPersistentCatalogRouteImageKey(item.code, item.article)
      ),
    }))
  );

  const images: Record<string, string> = {};
  for (const item of resolved) {
    if (!item.ready) continue;
    images[item.key] = buildProductImagePath(item.code, item.article, {
      catalog: true,
    });
  }

  return images;
};
