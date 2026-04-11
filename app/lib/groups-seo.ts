import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";

import { oneCRequest } from "app/api/_lib/oneC";

interface GroupsSeoContent {
  title: string;
  groups: string[];
}

const NAME_KEYS = [
  "Наименование",
  "Найменування",
  "name",
] as const;
const CHILD_KEYS = [
  "ДочерніЕлементи",
  "ДочерниеЭлементы",
  "children",
] as const;

const normalizeValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const tryFix1CJson = (raw: string) => {
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
    } catch {
      // ignore
    }
  }

  const objectStart = raw.indexOf("{");
  const objectEnd = raw.lastIndexOf("}");
  if (objectStart !== -1 && objectEnd > objectStart) {
    const slice = raw.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(slice) as unknown;
    } catch {
      // ignore
    }
  }

  return null;
};

const parseGroupResponse = (text: string) => {
  const trimmed = (text || "").trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const fixed = tryFix1CJson(trimmed);
    if (Array.isArray(fixed)) return fixed;

    const extracted = extractJsonBlock(trimmed);
    return Array.isArray(extracted) ? extracted : [];
  }
};

const readGroupLabel = (value: unknown) => {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;

  for (const key of NAME_KEYS) {
    const raw = record[key];
    if (typeof raw !== "string") continue;
    const normalized = normalizeValue(raw);
    if (normalized) return normalized;
  }

  return "";
};

const readChildNodes = (value: unknown) => {
  if (!value || typeof value !== "object") return [] as unknown[];
  const record = value as Record<string, unknown>;

  for (const key of CHILD_KEYS) {
    const raw = record[key];
    if (Array.isArray(raw)) return raw;
  }

  return [] as unknown[];
};

const collectGroupLabels = (rows: unknown[]) => {
  const labels = new Set<string>();

  const visit = (node: unknown) => {
    const label = readGroupLabel(node);
    if (label) labels.add(label);

    for (const child of readChildNodes(node)) {
      visit(child);
    }
  };

  for (const row of rows) {
    visit(row);
  }

  return Array.from(labels).sort((a, b) =>
    a.localeCompare(b, "uk", { sensitivity: "base" })
  );
};

const buildGroupsSeoContent = async (): Promise<GroupsSeoContent> => {
  const response = await oneCRequest("getprod", {
    method: "POST",
    body: {},
    cacheTtlMs: 1000 * 60 * 60 * 6,
  });

  const rows = parseGroupResponse(response.text);
  const groups = collectGroupLabels(rows);

  return {
    title: "Группи товарів",
    groups,
  };
};

const collectGroupsSeoContentWithRevalidate = unstable_cache(
  buildGroupsSeoContent,
  ["groups-seo-v2"],
  {
    revalidate: 60 * 60 * 6,
    tags: ["groups-seo"],
  }
);

const collectGroupsSeoContent = cache(async (): Promise<GroupsSeoContent> =>
  collectGroupsSeoContentWithRevalidate()
);

export const getGroupsSeoContent = async () => collectGroupsSeoContent();
