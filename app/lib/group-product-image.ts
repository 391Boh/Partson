import groupPreviewManifest from "app/generated/group-preview-manifest";
import { buildVisibleProductName } from "app/lib/product-url";

export const GROUP_PRODUCT_PREVIEW_WIDTH = 360;
export const GROUP_PRODUCT_PREVIEW_HEIGHT = 180;

export type GroupProductPreview = {
  url: string;
  width: number;
  height: number;
  alt: string;
};

type GroupProductPreviewOptions = {
  categoryLabel: string;
  itemLabel?: string | null;
  parentLabel?: string | null;
};

const normalizePreviewLabel = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("uk-UA");

const buildPreviewKey = (
  parentLabel: string | null | undefined,
  childLabel: string | null | undefined
) => {
  const parent = normalizePreviewLabel(parentLabel);
  const child = normalizePreviewLabel(childLabel);
  return parent && child ? `${parent}::${child}` : "";
};

const previewEntries = Object.entries(groupPreviewManifest);

const findPairPreview = (
  parentLabel: string | null | undefined,
  childLabel: string | null | undefined
) => {
  const key = buildPreviewKey(parentLabel, childLabel);
  return key ? groupPreviewManifest[key] || "" : "";
};

const findCategoryPreview = (categoryLabel: string) => {
  const categoryKey = normalizePreviewLabel(categoryLabel);
  if (!categoryKey) return "";

  const prefix = `${categoryKey}::`;
  return previewEntries.find(([key]) => key.startsWith(prefix))?.[1] || "";
};

const findItemPreview = (itemLabel: string) => {
  const itemKey = normalizePreviewLabel(itemLabel);
  if (!itemKey) return "";

  const suffix = `::${itemKey}`;
  return previewEntries.find(([key]) => key.endsWith(suffix))?.[1] || "";
};

/**
 * Returns a verified, build-time product photo for a category/group page.
 *
 * The generated manifest contains photos fetched from real catalog products,
 * not decorative category icons. Keeping this resolver synchronous means the
 * exact same stable URL can be used in rendered HTML, metadata, JSON-LD and
 * the image sitemap without adding a live 1C request to page rendering.
 */
export const getGroupProductPreview = ({
  categoryLabel,
  itemLabel,
  parentLabel,
}: GroupProductPreviewOptions): GroupProductPreview | null => {
  const item = (itemLabel || "").trim();
  const parent = (parentLabel || "").trim();

  const url = item
    ? findPairPreview(parent || categoryLabel, item) ||
      // A group whose products all live in child subgroups may not have a
      // direct category→group preview, while one of its verified
      // group→subgroup previews is still fully representative.
      findCategoryPreview(item) ||
      findPairPreview(categoryLabel, item) ||
      (parent ? findPairPreview(categoryLabel, parent) : "")
    : findCategoryPreview(categoryLabel) || findItemPreview(categoryLabel);

  if (!url) return null;

  const visibleCategory = buildVisibleProductName(categoryLabel);
  const visibleItem = buildVisibleProductName(item);
  const alt = visibleItem
    ? `Товар групи «${visibleItem}» у категорії «${visibleCategory}»`
    : `Товар із категорії «${visibleCategory}»`;

  return {
    url,
    width: GROUP_PRODUCT_PREVIEW_WIDTH,
    height: GROUP_PRODUCT_PREVIEW_HEIGHT,
    alt,
  };
};
