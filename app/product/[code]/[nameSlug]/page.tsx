import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildPageMetadata } from "app/lib/seo-metadata";

interface LegacySeoProductRouteParams {
  code: string;
  nameSlug: string;
}

type LegacySeoProductRouteSearchParams = Record<string, string | string[] | undefined>;

interface LegacySeoProductRouteProps {
  params: Promise<LegacySeoProductRouteParams>;
  searchParams?: Promise<LegacySeoProductRouteSearchParams>;
}

export const metadata: Metadata = buildPageMetadata({
  title: "Переадресація товару | PartsON",
  description:
    "Службовий маршрут переадресації на канонічну сторінку товару PartsON.",
  canonicalPath: "/product",
  index: false,
  follow: true,
});

const buildSearchParamsString = (searchParams: LegacySeoProductRouteSearchParams) => {
  const params = new URLSearchParams();

  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (rawValue == null) continue;

    if (Array.isArray(rawValue)) {
      for (const value of rawValue) {
        const normalizedValue = (value || "").trim();
        if (!normalizedValue) continue;
        params.append(key, normalizedValue);
      }
      continue;
    }

    const normalizedValue = rawValue.trim();
    if (!normalizedValue) continue;
    params.set(key, normalizedValue);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
};

export default async function LegacySeoProductRoute({
  params,
  searchParams,
}: LegacySeoProductRouteProps) {
  const { code, nameSlug } = await params;
  const normalizedSearchParams = (await searchParams) || {};

  redirect(
    `/product/${encodeURIComponent((code || "").trim())}--${encodeURIComponent(
      (nameSlug || "").trim()
    )}${buildSearchParamsString(normalizedSearchParams)}`
  );
}
