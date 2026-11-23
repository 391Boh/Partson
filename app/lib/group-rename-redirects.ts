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

// Catalog restructure of 2026-11-23 (made in 1C directly, so not in the
// admin-panel log): sections renamed, merged groups and groups that moved to
// another section under a new name. Groups that moved under their old name are
// found by slug below.
const STATIC_GROUP_RENAMES: GroupRename[] = [
  { from: "Інше", to: "Аксесуари", parentName: "" },
  { from: "Датчики та електроніка", to: "Електрика та електроніка", parentName: "" },
  { from: "Рідина та мастило", to: "Оливи, рідини та автохімія", parentName: "" },
  { from: "Омивання скла", to: "Склоочисники та омивачі", parentName: "Датчики та електроніка" },
  { from: "Двірник склоочисника", to: "Щітки склоочисника", parentName: "Омивання скла" },
  { from: "Лампочки", to: "Автолампи", parentName: "Освітлення" },
  { from: "Підйом скла", to: "Склопідіймачі", parentName: "Датчики та електроніка" },
  { from: "Привід замка", to: "Елементи закривання (Замок/Ручка)", parentName: "Датчики та електроніка" },
  { from: "Релле поворотів", to: "Реле поворотів", parentName: "Датчики та електроніка" },
  { from: "Електроніка двигуна", to: "Система запалення", parentName: "Деталі двигуна" },
  { from: "Деталі генератора", to: "Генератор і стартер", parentName: "Електроніка двигуна" },
  { from: "Регулятор напруги/ шоколадка", to: "Регулятор напруги", parentName: "Деталі генератора" },
  { from: "Перетворювач тиску", to: "Датчики", parentName: "Електроніка двигуна" },
  { from: "Контактні групи.", to: "Контактні групи", parentName: "Система запалення" },
  { from: "Сальник", to: "Катушки запалення", parentName: "Система запалення" },
  { from: "Втулки", to: "Натяжний", parentName: "Деталі двигуна" },
  { from: "Стабілізатори", to: "Опори багажника(Стійки)", parentName: "Деталі двигуна" },
  { from: "Масляний піддон", to: "Система змащення", parentName: "Деталі двигуна" },
  { from: "Система змаски", to: "Система змащення", parentName: "Деталі двигуна" },
  { from: "Картерні гази", to: "Шланг картерних газів", parentName: "Деталі двигуна" },
  { from: "Шланг продування картерних газів", to: "Шланг картерних газів", parentName: "Картерні гази" },
  { from: "Клапана", to: "Клапани", parentName: "Деталі двигуна" },
  { from: "Турбокомпрессор", to: "Турбокомпресор", parentName: "Деталі двигуна" },
  { from: "Стійка стабілізатора", to: "Тяга стабілізатора(Стійка)", parentName: "Тяга стабілізатора(Стійка)" },
  { from: "Ремонтні комплекти (РемКомплект)", to: "Регулятор гальмівних сил", parentName: "Гальмівна система" },
  { from: "Муфта", to: "Шківи", parentName: "Привід та коробка передач" },
  { from: "Гільзи/ Направляючі", to: "Вижимний підшипник", parentName: "Привід та коробка передач" },
  { from: "Система щеплення", to: "Система зчеплення", parentName: "Привід та коробка передач" },
  { from: "Вилка щеплення", to: "Вилка зчеплення", parentName: "Система щеплення" },
  { from: "Комплект щеплення", to: "Комплект зчеплення", parentName: "Система щеплення" },
  { from: "Трос щеплення", to: "Трос зчеплення", parentName: "Система щеплення" },
  { from: "Циліндр щеплення", to: "Циліндр зчеплення", parentName: "Система щеплення" },
];

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
const findGroupPathBySlug = (dataset: ProductTreeDataset, slug: string) => {
  const matches = (label: string, nodeSlug: string, legacySlug?: string) =>
    nodeSlug === slug || legacySlug === slug || buildPlainSeoSlug(label) === slug || buildSeoSlug(label) === slug;
  for (const group of dataset.groups) {
    for (const subgroup of group.subgroups) {
      if (matches(subgroup.label, subgroup.slug, subgroup.legacySlug)) return buildGroupItemPath(group.slug, subgroup.slug);
      for (const child of subgroup.children) {
        if (matches(child.label, child.slug, child.legacySlug)) return buildGroupItemPath(group.slug, child.slug);
      }
    }
    if (matches(group.label, group.slug, group.legacySlug)) return `/groups/${encodeURIComponent(group.slug)}`;
  }
  return null;
};

// For a /groups URL that 404s: the current URL of the group it named before
// it was renamed (admin panel or STATIC_GROUP_RENAMES) or moved to another
// section. Most specific segment first; follows rename chains.
export const resolveRenamedGroupRedirect = async (slugs: string[]): Promise<string | null> => {
  const [loaded, dataset] = await Promise.all([
    loadGroupRenames().catch(() => [] as GroupRename[]),
    getProductTreeDataset().catch(() => null),
  ]);
  if (!dataset) return null;
  const renames = [...loaded, ...STATIC_GROUP_RENAMES];

  for (const slug of [...slugs].reverse()) {
    const target = slug.trim().toLowerCase();
    if (!target) continue;
    const rename = renames.find((entry) => slugsOf(entry.from, entry.parentName).includes(target));
    if (rename) {
      let name = rename.to;
      for (let hop = 0; hop < 5; hop += 1) {
        const next = renames.find((entry) => normalizeKey(entry.from) === normalizeKey(name));
        if (!next || normalizeKey(next.to) === normalizeKey(name)) break;
        name = next.to;
      }
      const path = findGroupPath(dataset, name);
      if (path) return path;
    }
    // Moved to another section under the same name.
    const moved = findGroupPathBySlug(dataset, target);
    if (moved) return moved;
  }
  return null;
};
