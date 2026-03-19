import type { Metadata } from "next";

import KatalogClientPage from "app/katalog/KatalogClientPage";
import {
  buildCatalogCategoryPath,
  buildCatalogProducerPath,
} from "app/lib/catalog-links";
import { buildSeoSlug } from "app/lib/seo-slug";

interface KatalogPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const ALLOWED_SEO_KEYS = new Set([
  "tab",
  "group",
  "subcategory",
  "producer",
  "search",
  "filter",
  "reset",
]);

const pickFirstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] || "" : value || "";

const normalizeValue = (value: string | string[] | undefined) =>
  pickFirstValue(value).replace(/\s+/g, " ").trim();

const buildGroupLandingPath = (group: string) => {
  const slug = buildSeoSlug(group);
  return slug ? `/groups/${slug}` : buildCatalogCategoryPath(group);
};

const buildManufacturerLandingPath = (producer: string) => {
  const slug = buildSeoSlug(producer);
  return slug ? `/manufacturers/${slug}` : buildCatalogProducerPath(producer);
};

const buildCatalogMetadata = (searchParams: Record<string, string | string[] | undefined>) => {
  const tab = normalizeValue(searchParams.tab).toLowerCase();
  const group = normalizeValue(searchParams.group);
  const subcategory = normalizeValue(searchParams.subcategory);
  const producer = normalizeValue(searchParams.producer);
  const searchQuery = normalizeValue(searchParams.search);
  const searchFilter = normalizeValue(searchParams.filter);
  const resetFlag = normalizeValue(searchParams.reset);

  const usedKeys = Object.entries(searchParams)
    .filter(([, value]) => normalizeValue(value).length > 0)
    .map(([key]) => key);

  const hasUnsupportedParams = usedKeys.some((key) => !ALLOWED_SEO_KEYS.has(key));
  const hasEphemeralParams = Boolean(searchQuery || searchFilter || resetFlag);
  const hasSupportedTab = !tab || tab === "category" || tab === "producer";

  let canonicalPath = "/katalog";
  let title = "Каталог автозапчастин";
  let description =
    "Каталог автозапчастин PartsON з пошуком за кодом, артикулом, виробником та актуальною наявністю.";

  if (producer && group) {
    canonicalPath = buildCatalogProducerPath(producer, group);
    title = `${producer}: ${group} - каталог автозапчастин`;
    description =
      `Підбір автозапчастин ${producer} у групі ${group} в каталозі PartsON з актуальною наявністю.`;
  } else if (producer) {
    canonicalPath = buildManufacturerLandingPath(producer);
    title = `${producer} - виробник автозапчастин`;
    description =
      `Каталог автозапчастин виробника ${producer} у PartsON. Перейдіть до бренду та відкрийте товари з фільтром за виробником.`;
  } else if (group && subcategory) {
    canonicalPath = buildCatalogCategoryPath(group, subcategory);
    title = `${subcategory} - ${group} | Каталог автозапчастин`;
    description =
      `Підбір автозапчастин у підгрупі ${subcategory} групи ${group} в каталозі PartsON.`;
  } else if (group) {
    canonicalPath = buildGroupLandingPath(group);
    title = `${group} - група автозапчастин`;
    description =
      `Група автозапчастин ${group} у каталозі PartsON. Доступні підгрупи та швидкий перехід до релевантних товарів.`;
  } else if (tab === "category") {
    canonicalPath = "/groups";
    title = "Категорії автозапчастин";
    description =
      "Категорії, групи та підгрупи автозапчастин PartsON для швидкого переходу до потрібних товарів.";
  } else if (tab === "producer") {
    canonicalPath = "/manufacturers";
    title = "Виробники автозапчастин";
    description =
      "Каталог виробників і брендів автозапчастин PartsON з переходом до сторінок брендів і фільтрованого каталогу.";
  }

  const isRootCatalogPage = !tab && !group && !subcategory && !producer;
  const isDeepFacetPage = Boolean(
    (group && subcategory && !producer) || (producer && group)
  );
  const indexable =
    !hasUnsupportedParams &&
    !hasEphemeralParams &&
    hasSupportedTab &&
    (isRootCatalogPage || isDeepFacetPage);

  return {
    title,
    description,
    canonicalPath,
    indexable,
  };
};

export async function generateMetadata({ searchParams }: KatalogPageProps): Promise<Metadata> {
  const resolvedSearchParams = await (
    searchParams ?? Promise.resolve({} as Record<string, string | string[] | undefined>)
  );

  const { title, description, canonicalPath, indexable } =
    buildCatalogMetadata(resolvedSearchParams);

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      type: "website",
      locale: "uk_UA",
      url: canonicalPath,
      title: `${title} | PartsON`,
      description,
      images: [{ url: "/Car-parts-fullwidth.png", alt: `${title} | PartsON` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | PartsON`,
      description,
      images: ["/Car-parts-fullwidth.png"],
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

export default function KatalogPage() {
  return <KatalogClientPage />;
}
