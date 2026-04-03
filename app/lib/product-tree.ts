import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { oneCRequest } from "app/api/_lib/oneC";
import { buildSeoSlug } from "app/lib/seo-slug";

export interface ProductTreeNode {
  name: string;
  children: ProductTreeNode[];
}

export interface ProductTreeGroup {
  label: string;
  slug: string;
  subgroups: Array<{
    label: string;
    slug: string;
    children: Array<{
      label: string;
      slug: string;
    }>;
  }>;
}

export interface ProductTreeDataset {
  groups: ProductTreeGroup[];
  labels: string[];
}

const NAME_KEYS = ["Наименование", "Найменування", "name"] as const;
const CHILD_KEYS = ["ДочерніЕлементи", "ДочерниеЭлементы", "children"] as const;
const PRODUCT_ARRAY_KEYS = [
  "data",
  "items",
  "products",
  "categories",
  "result",
  "rows",
  "response",
  "payload",
  "groups",
  "records",
] as const;

const MAX_TREE_DEPTH = 8;
const MAX_CHILDREN_PER_NODE = 250;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const tryFixJson = (raw: string) => {
  let candidate = raw;

  if (candidate.includes("'") && !candidate.includes('"')) {
    candidate = candidate.replace(/'([^']*)'/g, (_, value: string) =>
      `"${value.replace(/"/g, '\\"')}"`
    );
  }

  candidate = candidate.replace(
    /([{,]\s*)([A-Za-z\u0400-\u04FF_][\w\u0400-\u04FF]*)\s*:/g,
    '$1"$2":'
  );
  candidate = candidate.replace(/(\d+),(\d+)/g, "$1.$2");
  candidate = candidate
    .replace(/\ufeff/g, "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
};

const extractJsonBlock = (raw: string) => {
  const arrayStart = raw.indexOf("[");
  const arrayEnd = raw.lastIndexOf("]");
  if (arrayStart !== -1 && arrayEnd > arrayStart) {
    const slice = raw.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(slice) as unknown;
    } catch {}
  }

  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const slice = raw.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(slice) as unknown;
    } catch {}
  }

  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const extractNodeArray = (value: unknown, depth = 0): unknown[] => {
  if (Array.isArray(value)) return value;
  if (!isRecord(value) || depth > 5) return [];

  for (const key of PRODUCT_ARRAY_KEYS) {
    const candidate = extractNodeArray(value[key], depth + 1);
    if (candidate.length > 0) return candidate;
  }

  for (const candidate of Object.values(value)) {
    const nested = extractNodeArray(candidate, depth + 1);
    if (nested.length > 0) return nested;
  }

  return [];
};

const parseTreeResponse = (text: string) => {
  const trimmed = (text || "").trim();
  if (!trimmed) return [] as unknown[];

  try {
    return extractNodeArray(JSON.parse(trimmed) as unknown);
  } catch {
    const fixed = tryFixJson(trimmed);
    if (fixed) {
      const extracted = extractNodeArray(fixed);
      if (extracted.length > 0) return extracted;
    }

    const extracted = extractJsonBlock(trimmed);
    return extracted ? extractNodeArray(extracted) : [];
  }
};

const readNodeLabel = (value: unknown) => {
  if (!isRecord(value)) return "";
  for (const key of NAME_KEYS) {
    const raw = value[key];
    if (typeof raw !== "string") continue;
    const normalized = normalizeValue(raw);
    if (normalized) return normalized;
  }
  return "";
};

const readChildNodes = (value: unknown) => {
  if (!isRecord(value)) return [] as unknown[];
  for (const key of CHILD_KEYS) {
    const raw = value[key];
    if (Array.isArray(raw)) return raw.slice(0, MAX_CHILDREN_PER_NODE);
  }
  return [] as unknown[];
};

const toTreeNode = (value: unknown, depth = 0): ProductTreeNode => ({
  name: readNodeLabel(value) || "Без назви",
  children:
    depth < MAX_TREE_DEPTH
      ? readChildNodes(value).map((child) => toTreeNode(child, depth + 1))
      : [],
});

const compareLabels = (left: string, right: string) =>
  left.localeCompare(right, "uk", { sensitivity: "base" });

const normalizeTreeKey = (value: string) => normalizeValue(value).toLocaleLowerCase("uk-UA");

const buildDataset = (nodes: ProductTreeNode[]): ProductTreeDataset => {
  const labels = new Set<string>();

  const visit = (node: ProductTreeNode) => {
    const label = normalizeValue(node.name);
    if (label) labels.add(label);
    for (const child of node.children) visit(child);
  };

  for (const node of nodes) visit(node);

  const groups = nodes
    .map((group) => {
      const label = normalizeValue(group.name);
      const subgroupMap = new Map<
        string,
        {
          label: string;
          slug: string;
          children: Map<string, { label: string; slug: string }>;
        }
      >();

      for (const child of group.children) {
        const subgroupLabel = normalizeValue(child.name);
        if (!subgroupLabel) continue;

        const subgroupKey = normalizeTreeKey(subgroupLabel);
        const existingSubgroup =
          subgroupMap.get(subgroupKey) ??
          {
            label: subgroupLabel,
            slug: buildSeoSlug(`${label}-${subgroupLabel}`),
            children: new Map<string, { label: string; slug: string }>(),
          };

        for (const grandchild of child.children) {
          const childLabel = normalizeValue(grandchild.name);
          if (!childLabel) continue;
          if (normalizeTreeKey(childLabel) === subgroupKey) continue;

          existingSubgroup.children.set(normalizeTreeKey(childLabel), {
            label: childLabel,
            slug: buildSeoSlug(`${label}-${subgroupLabel}-${childLabel}`),
          });
        }

        subgroupMap.set(subgroupKey, existingSubgroup);
      }

      const subgroups = Array.from(subgroupMap.values())
        .map((entry) => ({
          label: entry.label,
          slug: entry.slug,
          children: Array.from(entry.children.values()).sort((left, right) =>
            compareLabels(left.label, right.label)
          ),
        }))
        .sort((left, right) => compareLabels(left.label, right.label));

      return {
        label,
        slug: buildSeoSlug(label),
        subgroups,
      };
    })
    .filter((group) => group.label)
    .sort((left, right) => compareLabels(left.label, right.label));

  return {
    groups,
    labels: Array.from(labels).sort(compareLabels),
  };
};

const fetchDataset = async (): Promise<ProductTreeDataset> => {
  const response = await oneCRequest("getprod", {
    method: "POST",
    body: {},
    cacheTtlMs: 1000 * 60 * 60 * 6,
  });

  const rows = parseTreeResponse(response.text);
  const nodes = rows.map((row) => toTreeNode(row));
  return buildDataset(nodes);
};

const fetchDatasetCached = unstable_cache(fetchDataset, ["product-tree-v2"], {
  revalidate: 60 * 60 * 6,
  tags: ["product-tree"],
});

export const getProductTreeDataset = cache(async () => fetchDatasetCached());
