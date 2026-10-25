import "server-only";

import { unstable_cache } from "next/cache";

import { buildManufacturerPathFromLabel } from "app/lib/catalog-links";
import { PRODUCER_RENAMES_COLLECTION, PRODUCER_RENAMES_TAG } from "app/lib/catalog-admin-server";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { buildPlainSeoSlug, buildSeoSlug } from "app/lib/seo-slug";

type ProducerRename = { from: string; to: string };

// Renames and deletions-with-replacement made from the admin panel
// (app/lib/catalog-admin-server.ts).
const loadProducerRenames = unstable_cache(
  async (): Promise<ProducerRename[]> => {
    const snapshot = await getFirebaseAdminDb()
      .collection(PRODUCER_RENAMES_COLLECTION)
      .orderBy("at", "asc")
      .limit(2000)
      .get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        from: typeof data.from === "string" ? data.from : "",
        to: typeof data.to === "string" ? data.to : "",
      };
    }).filter((rename) => rename.from && rename.to);
  },
  ["catalog-producer-renames-v1"],
  { revalidate: 60 * 10, tags: [PRODUCER_RENAMES_TAG] }
);

const normalizeKey = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");

// For a /manufacturers URL that 404s: the current page of the producer it
// named before an admin renamed or replaced it. Follows rename chains.
export const resolveRenamedProducerRedirect = async (slug: string): Promise<string | null> => {
  const renames = await loadProducerRenames().catch(() => [] as ProducerRename[]);
  if (!renames.length) return null;

  const target = slug.trim().toLowerCase();
  const rename = renames.find(
    (entry) => buildSeoSlug(entry.from) === target || buildPlainSeoSlug(entry.from) === target
  );
  if (!rename) return null;

  let name = rename.to;
  for (let hop = 0; hop < 5; hop += 1) {
    const next = renames.find((entry) => normalizeKey(entry.from) === normalizeKey(name));
    if (!next || normalizeKey(next.to) === normalizeKey(name)) break;
    name = next.to;
  }
  const path = buildManufacturerPathFromLabel(name);
  return path === "/manufacturers" ? null : path;
};
