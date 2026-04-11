import { cache } from "react";
import { readdir } from "node:fs/promises";
import path from "node:path";

const LOGO_EXTENSION_PATTERN = /\.(png|jpe?g|webp|svg)$/i;

const COMPANY_SUFFIX_PATTERN = /\b(inc|ltd|gmbh|llc|corp|company|co|sa|ag|ooo)\b/gi;

const normalizeBrandKey = (value: string) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

const stripCompanySuffix = (value: string) =>
  value.replace(COMPANY_SUFFIX_PATTERN, " ").replace(/\s+/g, " ").trim();

const loadBrandLogoMap = cache(async () => {
  const map = new Map<string, string>();

  try {
    const directoryPath = path.join(process.cwd(), "public", "Brands");
    const files = await readdir(directoryPath, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile()) continue;
      if (!LOGO_EXTENSION_PATTERN.test(file.name)) continue;

      const fileLabel = file.name.replace(/\.[^.]+$/, "");
      const normalized = normalizeBrandKey(fileLabel);
      if (!normalized) continue;

      map.set(normalized, `/Brands/${encodeURIComponent(file.name)}`);
    }
  } catch {
    return map;
  }

  return map;
});

export const getProducerInitials = (label: string) => {
  const letters = (label || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("");

  return letters.toUpperCase() || "BR";
};

export const resolveProducerLogo = (label: string, logoMap: Map<string, string>) => {
  if (!label) return null;

  const directKey = normalizeBrandKey(label);
  if (directKey && logoMap.has(directKey)) return logoMap.get(directKey) || null;

  const trimmedCompanyKey = normalizeBrandKey(stripCompanySuffix(label));
  if (trimmedCompanyKey && logoMap.has(trimmedCompanyKey)) {
    return logoMap.get(trimmedCompanyKey) || null;
  }

  for (const [logoKey, logoPath] of logoMap.entries()) {
    if (!directKey) continue;
    if (directKey.includes(logoKey) || logoKey.includes(directKey)) {
      return logoPath;
    }
  }

  return null;
};

export const getBrandLogoMap = async () => loadBrandLogoMap();
