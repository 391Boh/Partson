import "server-only";

import { unstable_cache } from "next/cache";

import { buildGroupItemPath } from "app/lib/catalog-links";
import { GROUP_RENAMES_COLLECTION, GROUP_RENAMES_TAG } from "app/lib/catalog-admin-server";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import { getProductTreeDataset, type ProductTreeDataset } from "app/lib/product-tree";
import { buildPlainSeoSlug, buildSeoSlug } from "app/lib/seo-slug";

type GroupRename = { from: string; to: string; parentName: string };

// Renames made from the admin panel (app/lib/catalog-admin-server.ts).
const loadGroupRenames = unstable_cache(
  async (): Promise<GroupRename[]> => {
    const snapshot = await getFirebaseAdminDb()
      .collection(GROUP_RENAMES_COLLECTION)
      .orderBy("at", "asc")
      .limit(2000)
      .get();
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        from: typeof data.from === "string" ? data.from : "",
        to: typeof data.to === "string" ? data.to : "",
        parentName: typeof data.parentName === "string" ? data.parentName : "",
      };
    }).filter((rename) => rename.from && rename.to);
  },
  ["catalog-group-renames-v1"],
  { revalidate: 60 * 10, tags: [GROUP_RENAMES_TAG] }
);

const normalizeKey = (value: string) => value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");

// Every slug shape a group URL can have: plain/hashed name, and the
// parent-prefixed forms product-tree uses for collisions and legacy links.
const slugsOf = (name: string, parentName: string) => {
  const sources = [name];
  if (parentName) sources.push(`${parentName}-${name}`);
  return sources.flatMap((source) => [buildPlainSeoSlug(source), buildSeoSlug(source)]);
};

const findGroupPath = (dataset: ProductTreeDataset, name: string) => {
  const key = normalizeKey(name);
  for (const group of dataset.groups) {
    if (normalizeKey(group.label) === key) return `/groups/${encodeURIComponent(group.slug)}`;
    for (const subgroup of group.subgroups) {
      if (normalizeKey(subgroup.label) === key) return buildGroupItemPath(group.slug, subgroup.slug);
      for (const child of subgroup.children) {
        if (normalizeKey(child.label) === key) return buildGroupItemPath(group.slug, child.slug);
      }
    }
  }
  return null;
};

// For a /groups URL that 404s: the current URL of the group it named before
// an admin renamed it. Most specific segment first; follows rename chains.
export const resolveRenamedGroupRedirect = async (slugs: string[]): Promise<string | null> => {
  const [renames, dataset] = await Promise.all([
    loadGroupRenames().catch(() => [] as GroupRename[]),
    getProductTreeDataset().catch(() => null),
  ]);
  if (!renames.length || !dataset) return null;

  for (const slug of [...slugs].reverse()) {
    const target = slug.trim().toLowerCase();
    const rename = renames.find((entry) => slugsOf(entry.from, entry.parentName).includes(target));
    if (!rename) continue;

    let name = rename.to;
    for (let hop = 0; hop < 5; hop += 1) {
      const next = renames.find((entry) => normalizeKey(entry.from) === normalizeKey(name));
      if (!next || normalizeKey(next.to) === normalizeKey(name)) break;
      name = next.to;
    }
    const path = findGroupPath(dataset, name);
    if (path) return path;
  }
  return null;
};
