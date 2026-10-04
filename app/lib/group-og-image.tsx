import "server-only";

import { getCategoryIconPath } from "app/lib/category-icons";
import { getGroupProductPreview } from "app/lib/group-product-image";
import { loadOgProductImage, renderOgCard } from "app/lib/og-card";
import { getProductTreeDataset } from "app/lib/product-tree";
import { buildVisibleProductName } from "app/lib/product-url";

// OG cards for /groups/[slug] and /groups/[slug]/[itemSlug]. The generated
// group previews are 360×180 catalog thumbnails — too small for a large
// search/social preview on their own — so they're framed inside a 1200×630
// card instead. Uses only the cached product tree (no SEO facet lookups) to
// stay cheap; an unknown slug still gets a generic, valid card.
const GROUP_FACTS = [
  { value: "Оригінал", label: "та перевірені аналоги" },
  { value: "VIN", label: "підбір під ваше авто" },
  { value: "1–2 дні", label: "доставка по Україні" },
];

const matches = (entry: { slug: string; legacySlug?: string }, slug: string) =>
  entry.slug === slug || entry.legacySlug === slug;

type GroupOgLabels = { groupLabel: string; parentLabel?: string; itemLabel?: string };

export async function resolveGroupOgLabels(groupSlug: string, itemSlug?: string): Promise<GroupOgLabels | null> {
  const dataset = await getProductTreeDataset().catch(() => null);
  const group = dataset?.groups.find((entry) => matches(entry, groupSlug));
  if (!group) return null;
  if (!itemSlug) return { groupLabel: group.label };

  for (const subgroup of group.subgroups) {
    if (matches(subgroup, itemSlug)) return { groupLabel: group.label, itemLabel: subgroup.label };
    const child = subgroup.children.find((entry) => matches(entry, itemSlug));
    if (child) return { groupLabel: group.label, parentLabel: subgroup.label, itemLabel: child.label };
  }
  return { groupLabel: group.label };
}

export async function renderGroupOgImage(groupSlug: string, itemSlug?: string) {
  const labels = await resolveGroupOgLabels(groupSlug, itemSlug);
  if (!labels) {
    return renderOgCard({ kicker: "Каталог автозапчастин", title: "Автозапчастини у Львові — PartsON", facts: GROUP_FACTS });
  }

  const { groupLabel, parentLabel, itemLabel } = labels;
  const preview = getGroupProductPreview({
    categoryLabel: groupLabel,
    parentLabel: itemLabel ? parentLabel || groupLabel : undefined,
    itemLabel,
  });
  const productImage =
    (preview?.url ? await loadOgProductImage(preview.url) : undefined) ??
    (await loadOgProductImage(getCategoryIconPath(groupLabel)));

  return renderOgCard({
    kicker: itemLabel ? buildVisibleProductName(groupLabel) : "Каталог автозапчастин",
    title: `${buildVisibleProductName(itemLabel || groupLabel)} — купити у Львові`,
    facts: GROUP_FACTS,
    productImage,
  });
}

export const groupOgAlt = async (groupSlug: string, itemSlug?: string) => {
  const labels = await resolveGroupOgLabels(groupSlug, itemSlug);
  return labels
    ? `${buildVisibleProductName(labels.itemLabel || labels.groupLabel)} — каталог автозапчастин PartsON`
    : "Каталог автозапчастин PartsON";
};
