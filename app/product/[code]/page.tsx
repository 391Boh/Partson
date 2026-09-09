import { cache, Suspense, type CSSProperties } from "react";
import type { Metadata } from "next";
import { unstable_cache } from "next/cache";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  BadgeCheck,
  ChevronRight,
  CircleCheck,
  MapPin,
  PackageSearch,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";

import {
  type CatalogProduct,
  fetchCatalogProductsByArticle,
  fetchEuroRate,
  findCatalogProductByCode,
  toPriceUah,
} from "app/lib/catalog-server";
import ProductImageWithFallback from "app/components/ProductImageWithFallback";
import ProductGallery from "app/components/ProductGallery";
import ProductPageAdminEditGate from "app/components/ProductPageAdminEditGate";
import ProductRelatedItemsSection from "app/components/ProductRelatedItemsSection";
import {
  buildCatalogCategoryPath,
  buildGroupItemPath,
  buildGroupPath,
  buildManufacturerPath,
} from "app/lib/catalog-links";
import { PRODUCT_IMAGE_FALLBACK_PATH } from "app/lib/product-image-constants";
import {
  buildProductSeoImagePath,
} from "app/lib/product-image-path";
import {
  buildLegacyProductNameSlug,
  buildProductPath,
  buildProductNameSlug,
  buildVisibleCategoryLabel,
  buildVisibleProductName,
  extractProductCodeFromParam,
  extractProductRouteSlugsFromParam,
  safeDecodeURIComponent,
} from "app/lib/product-url";
import {
  resolveProductCodeFromNameSlug,
  resolveProductCodeFromSeoRoute,
} from "app/lib/product-route-resolver";
import { getSiteUrl } from "app/lib/site-url";
import { safeJsonLd } from "app/lib/safe-json-ld";
import { buildProductFaqJsonLd } from "app/lib/product-faq";
import { isPublicCatalogProduct } from "app/lib/public-catalog-product";
import { buildPlainSeoSlug } from "app/lib/seo-slug";
import { SEO_TITLE_MAX_LENGTH } from "app/lib/seo-metadata";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";
import { getFirebaseAdminDb } from "app/lib/firebase-admin";
import {
  getAllPricedProductSitemapEntries,
  getAllProductSitemapEntries,
  getAllProductSitemapSnapshotEntries,
  type ProductSitemapEntry,
} from "app/lib/product-sitemap";
import { getBrandLogoMap, resolveProducerLogo } from "app/lib/brand-logo";
import {
  getProductReviews,
  getProductReviewStats,
  type ProductReview,
} from "app/lib/reviews-server";

// 1C itself is documented (see ProductCard.tsx's DESCRIPTION_REQUEST_TIMEOUT_MS)
// to take 1.9-3.7s per call, even back-to-back, and oneC.js additionally
// queues requests past its per-endpoint concurrency limit (getEndpointConcurrencyLimit
// in app/api/_lib/oneC.js) — under real traffic a lookup can sit queued before
// it even starts. Every timeout below that gates whether a product is treated
// as "found" was previously tighter than that documented worst case, so any
// product could intermittently render as not-found under normal 1C latency —
// not just ones missing a price (which merely made it more likely by adding
// an extra round trip, see the enrichLookupCandidate fix in catalog-server.ts).
// ISR caches a successful render for an hour, so paying this cost occasionally
// is far cheaper than wrongly 404ing a real product.
const PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS = 4000;
const PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS = 4000;
// Used instead of the full budget above when a sitemap-snapshot product is
// already available as a fallback — see the call site for why a short
// timeout is safe there specifically. Measured live: this consistently hit
// its full budget without the 1C call actually resolving in time (900ms
// wasn't "usually enough, sometimes not" — it was "never enough"), so a
// shorter cap here loses nothing observed while capping the worst case
// further.
const PRODUCT_PAGE_PRODUCT_REFRESH_TIMEOUT_MS = 500;
const PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS = 4000;
const PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS = 80;
const PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS = 4000;
// Both run concurrently via Promise.all below, so raising either only caps
// that one promise's own worst case — it doesn't add to the other's wait.
// 220-250ms was too tight for a real Firestore round-trip (a cold/network-
// bound admin-SDK read routinely exceeds that), which was silently dropping
// the gallery images array from SSR/JSON-LD on every render, not just slow
// ones — the client-side ProductGallery component does eventually recover
// via its own fetch, but the JSON-LD image list and first-paint gallery
// state were wrong far more often than intended.
const PRODUCT_PAGE_REVIEWS_TIMEOUT_MS = 900;
const PRODUCT_PAGE_GALLERY_TIMEOUT_MS = 900;

// Extra photos live in Firestore (see app/components/ProductGallery.tsx,
// which reads the same collection client-side for the live-updating strip
// under the hero photo) — separate from the single 1C-sourced photo. Pulled
// in here too so the Product JSON-LD's image array isn't limited to one
// photo when a product actually has more.
const fetchProductGalleryImageUrls = async (code: string): Promise<string[]> => {
  if (!code) return [];
  const snap = await getFirebaseAdminDb()
    .collection("productGallery")
    .doc(code)
    .collection("images")
    .orderBy("uploadedAt", "asc")
    .get();
  return snap.docs
    .map((doc) => doc.data().url as string)
    .filter((url): url is string => typeof url === "string" && url.length > 0);
};
const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
const STORE_PHONE_TEL = "+380634211851";
const STORE_ADDRESS = "Львів, вул. Перфецького, 8";
const PRODUCT_META_DESCRIPTION_MAX_LENGTH = 160;
const shouldPreferSitemapProductLookup = true;

const parseProductStaticParamsLimit = (value: string | undefined) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
};

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams() {
  // Respect the documented build limit in production too. dynamicParams + ISR
  // keep every other product route available without pre-rendering thousands
  // of 1C-backed pages during a single build.
  const limit = parseProductStaticParamsLimit(process.env.SEO_PRODUCT_STATIC_PARAMS_LIMIT);
  if (limit <= 0) return [];

  try {
    const entries = await getAllPricedProductSitemapEntries();
    const seen = new Set<string>();
    const params: Array<{ code: string }> = [];

    for (const entry of entries) {
      if (!entry.code) continue;
      if (params.length >= limit) break;

      const productPath = buildProductPath({
        code: entry.code,
        article: entry.article,
        name: entry.name,
        producer: entry.producer,
        group: entry.group,
        subGroup: entry.subGroup,
        category: entry.category,
      });
      const code = safeDecodeURIComponent(productPath.replace(/^\/product\//, ""));
      const dedupeKey = code.toLocaleLowerCase("uk-UA");
      if (!code || seen.has(dedupeKey)) continue;

      seen.add(dedupeKey);
      params.push({ code });
    }

    return params;
  } catch {
    return [];
  }
}

const ProductPurchasePanelClient = dynamic(
  () => import("app/components/ProductPurchasePanelClient"),
  {
    loading: () => (
      <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_18px_46px_rgba(15,23,42,0.08)] sm:rounded-[24px]">
        <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[minmax(190px,0.72fr)_minmax(290px,1.28fr)] xl:items-center xl:gap-6">
          <div>
            <div className="h-3 w-20 animate-pulse rounded-full bg-sky-100 motion-reduce:animate-none" />
            <div className="mt-2 h-10 w-44 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
            <div className="mt-3 h-7 w-36 animate-pulse rounded-full bg-emerald-50 motion-reduce:animate-none" />
          </div>
          <div className="xl:border-l xl:border-slate-200 xl:pl-6">
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
            <div className="mt-3 h-[52px] animate-pulse rounded-[16px] bg-slate-100 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="grid border-t border-slate-200 bg-slate-50/80 sm:grid-cols-2">
          <div className="h-[62px] border-b border-slate-200 sm:border-b-0 sm:border-r" />
          <div className="h-[62px]" />
        </div>
      </section>
    ),
  }
);

const ProductDescriptionClientCard = dynamic(
  () => import("app/components/ProductDescriptionClientCard"),
  {
    loading: () => (
      <section className="overflow-hidden rounded-[22px] border border-sky-100 bg-white/92 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.06)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
        <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <div className="h-3 w-20 animate-pulse rounded-full bg-sky-100" />
            <div className="mt-2 h-6 w-56 max-w-full animate-pulse rounded-full bg-slate-100" />
          </div>
          <div className="h-8 w-28 animate-pulse rounded-[12px] bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-slate-100" />
        </div>
      </section>
    ),
  }
);

const OpenChatButton = dynamic(() => import("app/components/OpenChatButton"), {
  loading: () => (
    <span className="inline-flex h-9 w-9 rounded-[12px] border border-sky-100 bg-sky-50" />
  ),
});

const ProductReviewsSection = dynamic(
  () => import("app/components/ProductReviewsSection"),
  { loading: () => null }
);

const ProductFaqSection = dynamic(
  () => import("app/components/ProductFaqSection"),
  {
    loading: () => (
      <div className="overflow-hidden rounded-[22px] border border-teal-100 bg-white/92 p-3 shadow-[0_18px_42px_rgba(15,23,42,0.06)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-teal-100" />
          <div className="h-6 w-56 max-w-full animate-pulse rounded-full bg-slate-100" />
        </div>
        <div className="mt-3 space-y-2">
          <div className="h-4 w-full animate-pulse rounded-full bg-slate-100" />
          <div className="h-4 w-11/12 animate-pulse rounded-full bg-slate-100" />
        </div>
      </div>
    ),
  }
);

const ProductDeferredRecommendations = dynamic(
  () => import("app/components/ProductDeferredRecommendations"),
  { loading: () => null }
);

const ProductRelatedItemsFallback = () => (
  <section
    aria-label="Завантаження рекомендованих товарів"
    className="overflow-hidden rounded-[22px] border border-sky-100 bg-[linear-gradient(145deg,rgba(255,255,255,0.99),rgba(240,249,255,0.92),rgba(248,250,252,0.98))] p-3 shadow-[0_12px_28px_rgba(15,23,42,0.05)] ring-1 ring-white/80 sm:rounded-[24px] sm:p-4"
  >
    <div className="flex items-end justify-between gap-3 border-b border-slate-100 pb-2.5">
      <div className="min-w-0 flex-1">
        <div className="h-3 w-28 animate-pulse rounded-full bg-sky-100 motion-reduce:animate-none" />
        <div className="mt-2 h-6 w-72 max-w-full animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
      </div>
      <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
    </div>
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      {Array.from({ length: 2 }).map((_, index) => (
        <div
          key={index}
          className="h-[88px] animate-pulse rounded-[14px] border border-slate-200 bg-slate-100 motion-reduce:animate-none"
        />
      ))}
    </div>
  </section>
);

interface ProductPageParams {
  code: string;
}

interface ProductPageProps {
  params: Promise<ProductPageParams>;
}

const pageBackground: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle at 4% 0%, rgba(14,165,233,0.18), transparent 25%), radial-gradient(circle at 96% 10%, rgba(45,212,191,0.12), transparent 23%), radial-gradient(circle at 50% 72%, rgba(125,211,252,0.08), transparent 30%), linear-gradient(180deg, #edf6fb 0%, #f8fafc 38%, #f2f7fa 100%)",
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeLandingValue = (value: string | null | undefined) =>
  (value || "").replace(/\s+/g, " ").trim();

const buildProductGroupLandingFallbackPath = (
  productCategory: string,
  productGroup: string
) => {
  const normalizedCategory = normalizeLandingValue(productCategory);
  const normalizedGroup = normalizeLandingValue(productGroup);

  if (
    normalizedCategory &&
    normalizedGroup &&
    normalizedCategory.toLocaleLowerCase("uk-UA") !==
      normalizedGroup.toLocaleLowerCase("uk-UA")
  ) {
    return buildGroupItemPath(
      buildPlainSeoSlug(normalizedCategory),
      buildPlainSeoSlug(normalizedGroup)
    );
  }

  if (normalizedGroup) {
    return buildGroupPath(normalizedGroup);
  }

  if (normalizedCategory) {
    return buildGroupPath(normalizedCategory);
  }

  return "/groups";
};

const buildPureProductName = (
  value: string,
  hints?: {
    producer?: string;
    article?: string;
    name?: string;
    group?: string;
    subGroup?: string;
  }
) => {
  const baseName = buildVisibleProductName(value);
  if (!baseName) return "Товар";

  const loweredBaseName = baseName.toLowerCase();
  const buyPrefixIndex = loweredBaseName.indexOf("купити ");
  const articleMarkerIndex = loweredBaseName.indexOf(" артикул ");
  const categoryMarkerIndex = loweredBaseName.indexOf(" у категор");

  // Handles common generated heading pattern: "Купити <NAME> артикул <...> у категорії <...>".
  if (buyPrefixIndex !== -1) {
    const nameStart = buyPrefixIndex + "купити ".length;
    const stopCandidates = [articleMarkerIndex, categoryMarkerIndex].filter(
      (index) => index > nameStart
    );
    const nameEnd = stopCandidates.length > 0 ? Math.min(...stopCandidates) : baseName.length;
    const extracted = baseName.slice(nameStart, nameEnd).replace(/\s{2,}/g, " ").trim();
    if (extracted) {
      return extracted;
    }
  }

  let cleaned = baseName
    .replace(/^купити\s+/iu, "")
    .replace(/\s*\|\s*.+$/u, "")
    .replace(/\s+[—-]\s*(артикул|код|виробник)\b.*$/iu, "")
    .replace(/\s+артикул\s+[^\s,;|/]+/giu, "")
    .replace(/\s+у\s+категорі[їи]\s+.+$/iu, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const normalizedArticle = (hints?.article || "").trim();
  if (normalizedArticle) {
    const articleRegex = new RegExp(
      `(?:\\s*[—-]?\\s*артикул\\s*)?${escapeRegExp(normalizedArticle)}\\b`,
      "iu"
    );
    cleaned = cleaned.replace(articleRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  const normalizedProducer = (hints?.producer || "").trim();
  if (normalizedProducer) {
    const producerTailRegex = new RegExp(
      `(?:\\s*[-/,]?\\s*)${escapeRegExp(normalizedProducer)}$`,
      "iu"
    );
    cleaned = cleaned.replace(producerTailRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  const categoryLabel = buildVisibleProductName(
    (hints?.subGroup || hints?.group || "").trim()
  );
  if (categoryLabel && categoryLabel !== "Товар") {
    const categoryTailRegex = new RegExp(
      `\\s*(?:у\\s+категорі[їи]\\s+)?${escapeRegExp(categoryLabel)}$`,
      "iu"
    );
    cleaned = cleaned.replace(categoryTailRegex, "").replace(/\s{2,}/g, " ").trim();
  }

  return cleaned || baseName;
};

const makeSeoTextTrim = (value: string) =>
  value
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();

const stripTrailingSeoPunctuation = (value: string) =>
  value
    // Keep a dash after two digits: "98-" means "from 1998 onward" in fitment text.
    .replace(/(?<!\b\d{2})[—–-]\s*$/u, "")
    .replace(/[.,;:\s]+$/u, "")
    .trim();

const buildReadableNameFromSlugSource = (value: string) => {
  const normalized = safeDecodeURIComponent(value || "").trim();
  if (!normalized) return "";

  return normalized
    .replace(/--/g, " ")
    .replace(/_/g, " ")
    .replace(/(?<=\p{L})-(?=\p{L})/gu, " ")
    .replace(/(?<=\p{L})-(?=\d)/gu, " ")
    .replace(/(?<=\d)-(?=\p{L})/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const buildFrontendProductHeading = (
  value: string,
  hints?: {
    producer?: string;
    article?: string;
    group?: string;
    subGroup?: string;
  }
) => {
  const baseName = buildVisibleProductName(value);
  if (!baseName) return "Товар";

  let cleaned = baseName;

  // Strip common generated wrapper from UI heading only.
  cleaned = cleaned.replace(/^\s*купити\s+/iu, "").trim();

  const markerMatch = cleaned.match(/\s+(артикул|у\s+категорі[їи])\b/iu);
  if (markerMatch && typeof markerMatch.index === "number") {
    cleaned = cleaned.slice(0, markerMatch.index).trim();
  }

  const normalizedArticle = (hints?.article || "").trim();
  if (normalizedArticle) {
    cleaned = cleaned
      .replace(
        new RegExp(
          `(?:\\s*[—-]?\\s*артикул\\s*)?${escapeRegExp(normalizedArticle)}\\b`,
          "iu"
        ),
        ""
      )
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const normalizedProducer = (hints?.producer || "").trim();
  if (normalizedProducer) {
    cleaned = cleaned
      .replace(new RegExp(`\\b${escapeRegExp(normalizedProducer)}\\b$`, "iu"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  const categoryLabel = buildVisibleProductName(
    (hints?.subGroup || hints?.group || "").trim()
  );
  if (categoryLabel && categoryLabel !== "Товар") {
    cleaned = cleaned
      .replace(new RegExp(`\\b${escapeRegExp(categoryLabel)}\\b$`, "iu"), "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return cleaned || buildPureProductName(value, hints);
};

const buildCatalogProductFromSitemapEntry = (
  entry: ProductSitemapEntry
): CatalogProduct => ({
  code: (entry.code || entry.article || "").trim(),
  article: (entry.article || "").trim(),
  name: (entry.name || entry.article || entry.code || "Товар").trim(),
  producer: (entry.producer || "").trim(),
  quantity: Number.isFinite(entry.quantity) ? Math.max(0, entry.quantity) : 0,
  priceEuro:
    typeof entry.priceEuro === "number" &&
    Number.isFinite(entry.priceEuro) &&
    entry.priceEuro > 0
      ? entry.priceEuro
      : entry.priceEuro === null
        ? null
        : undefined,
  group: (entry.group || "").trim(),
  subGroup: (entry.subGroup || "").trim(),
  category: (entry.category || "").trim(),
  hasPhoto: entry.hasPhoto,
});

const buildProductJsonLd = (options: {
  name: string;
  visibleName: string;
  description: string;
  code: string;
  article: string;
  producer: string;
  group: string;
  subGroup: string;
  quantity: number;
  priceUah: number | null;
  canonicalUrl: string;
  imageUrls: string[];
  aggregateRating?: { ratingCount: number; avgRating: number };
  reviews?: ProductReview[];
}) => {
  const {
    name,
    visibleName,
    description,
    code,
    article,
    producer,
    group,
    subGroup,
    quantity,
    priceUah,
    canonicalUrl,
    imageUrls,
    aggregateRating,
    reviews = [],
  } = options;

  const offers =
    priceUah != null
      ? {
          "@type": "Offer",
          "@id": `${canonicalUrl}#offer`,
          priceCurrency: "UAH",
          price: String(priceUah),
          availability:
            quantity > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          inventoryLevel:
            quantity > 0
              ? {
                  "@type": "QuantitativeValue",
                  value: quantity,
                }
              : undefined,
          seller: {
            "@type": "Organization",
            name: "PartsON",
            url: new URL("/", canonicalUrl).toString(),
            telephone: STORE_PHONE_TEL,
            address: {
              "@type": "PostalAddress",
              streetAddress: "вул. Перфецького, 8",
              addressLocality: "Львів",
              addressCountry: "UA",
            },
          },
          priceValidUntil: new Date(
            Date.now() + 1000 * 60 * 60 * 24 * 30
          ).toISOString().slice(0, 10),
          url: canonicalUrl,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    name: visibleName || name,
    alternateName: visibleName !== name ? visibleName : undefined,
    description,
    url: canonicalUrl,
    mainEntityOfPage: canonicalUrl,
    category: [group, subGroup].filter(Boolean).join(" / ") || "Автозапчастини",
    image: Array.from(new Set(imageUrls.filter(Boolean))).map((url) => ({
      "@type": "ImageObject",
      url,
      contentUrl: url,
      caption: `${visibleName || name}${article ? ` — артикул ${article}` : ""}`,
    })),
    sku: code || article || undefined,
    mpn: article || code || undefined,
    brand: producer ? { "@type": "Brand", name: producer } : undefined,
    manufacturer: producer ? { "@type": "Organization", name: producer } : undefined,
    identifier: [
      code
        ? {
            "@type": "PropertyValue",
            propertyID: "code",
            value: code,
          }
        : null,
      article
        ? {
            "@type": "PropertyValue",
            propertyID: "article",
            value: article,
          }
        : null,
    ].filter(Boolean),
    additionalProperty: [
      group
        ? {
            "@type": "PropertyValue",
            name: "Група",
            value: group,
          }
        : null,
      subGroup
        ? {
            "@type": "PropertyValue",
            name: "Підгрупа",
            value: subGroup,
          }
        : null,
    ].filter(Boolean),
    offers,
    ...(aggregateRating && aggregateRating.ratingCount >= 3
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: aggregateRating.avgRating.toFixed(1),
            reviewCount: String(aggregateRating.ratingCount),
            bestRating: "5",
            worstRating: "1",
          },
        }
      : {}),
    ...(reviews.length > 0
      ? {
          review: reviews.slice(0, 5).map((review) => ({
            "@type": "Review",
            author: {
              "@type": "Person",
              name: review.authorName || "Анонімний покупець",
            },
            reviewRating: {
              "@type": "Rating",
              ratingValue: String(review.rating),
              bestRating: "5",
              worstRating: "1",
            },
            datePublished: review.createdAt?.slice(0, 10) || undefined,
            reviewBody: review.comment || undefined,
          })),
        }
      : {}),
  };
};

const buildProductItemPageJsonLd = (options: {
  siteUrl: string;
  canonicalUrl: string;
  name: string;
  description: string;
  imageUrl: string;
  hasProductSchema: boolean;
}) => {
  const { siteUrl, canonicalUrl, name, description, imageUrl, hasProductSchema } = options;

  return {
    "@context": "https://schema.org",
    "@type": "ItemPage",
    "@id": `${canonicalUrl}#page`,
    url: canonicalUrl,
    name,
    description,
    isPartOf: {
      "@type": "WebSite",
      name: "PartsON",
      url: siteUrl,
    },
    ...(imageUrl
      ? {
          primaryImageOfPage: {
            "@type": "ImageObject",
            url: imageUrl,
          },
        }
      : {}),
    mainEntity: hasProductSchema
      ? {
          "@id": `${canonicalUrl}#product`,
        }
      : undefined,
  };
};

const buildProductBreadcrumbJsonLd = (options: {
  siteUrl: string;
  canonicalUrl: string;
  name: string;
  topCategoryName?: string;
  topCategoryPath?: string | null;
  groupName?: string;
  groupPath?: string | null;
  subGroupName?: string;
  subGroupPath?: string | null;
}) => {
  const {
    siteUrl,
    canonicalUrl,
    name,
    topCategoryName,
    topCategoryPath,
    groupName,
    groupPath,
    subGroupName,
    subGroupPath,
  } = options;

  const itemListElement = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Головна",
      item: siteUrl,
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Каталог",
      item: `${siteUrl}/katalog`,
    },
  ];

  if (topCategoryName && topCategoryPath) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: topCategoryName,
      item: `${siteUrl}${topCategoryPath}`,
    });
  }

  if (groupName && groupPath) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: groupName,
      item: `${siteUrl}${groupPath}`,
    });
  }

  if (
    subGroupName &&
    subGroupPath &&
    subGroupName.toLowerCase() !== (groupName || "").toLowerCase()
  ) {
    itemListElement.push({
      "@type": "ListItem",
      position: itemListElement.length + 1,
      name: subGroupName,
      item: `${siteUrl}${subGroupPath}`,
    });
  }

  itemListElement.push({
    "@type": "ListItem",
    position: itemListElement.length + 1,
    name,
    item: canonicalUrl,
  });

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
};

const findCatalogProductByArticleFast = async (value: string) => {
  const normalized = (value || "").trim();
  if (!normalized) return null;

  const byArticle = await fetchCatalogProductsByArticle(normalized, {
    limit: 4,
    timeoutMs: 480,
    retries: 0,
    retryDelayMs: 100,
    cacheTtlMs: 1000 * 20,
    exactOnly: true,
  });
  if (byArticle.length === 0) return null;

  const target = normalized.toLowerCase();
  return (
    byArticle.find((item) => item.article.trim().toLowerCase() === target) ||
    byArticle.find((item) => item.code.trim().toLowerCase() === target) ||
    byArticle[0] ||
    null
  );
};

const FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 10,
  fallbackPages: 1,
  pageSize: 24,
  timeoutMs: 820,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 20,
};
const DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS = {
  lookupLimit: 14,
  fallbackPages: 1,
  pageSize: 28,
  timeoutMs: 1050,
  retries: 0,
  retryDelayMs: 100,
  cacheTtlMs: 1000 * 60 * 10,
};
const getCatalogProductUncached = async (code: string) => {
  const initialMatch = await getFirstResolvedNonNull([
    findCatalogProductByCode(code, FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS).catch(
      () => null
    ),
    findCatalogProductByArticleFast(code).catch(() => null),
  ]);
  if (initialMatch) return initialMatch;

  // Reliability fallback: use default deep lookup only when fast sources miss.
  return findCatalogProductByCode(code, DEEP_PRODUCT_CATALOG_LOOKUP_OPTIONS).catch(
    () => null
  );
};

// No unstable_cache here — ISR (revalidate=3600) + oneC.js in-memory cache are sufficient.
// unstable_cache with a 900s TTL would prevent admin edits from showing immediately
// because revalidateTag has a race condition with router.refresh() in Next.js 16.
// After clearOneCCacheForProduct() + revalidatePath(), the next RSC render fetches fresh.
const getCatalogProduct = cache(getCatalogProductUncached);

const buildProductMetaDescription = (options: {
  category?: string;
  group?: string;
  subGroup?: string;
}) => {
  const { category, group, subGroup } = options;
  const cleanLabel = (value?: string) => {
    const label = buildVisibleCategoryLabel(value || "");
    return label === "Товар" ? "" : label;
  };
  const lowerFirst = (value: string) =>
    value ? `${value.charAt(0).toLocaleLowerCase("uk-UA")}${value.slice(1)}` : value;

  const categoryLabel = cleanLabel(category);
  const productGroupLabel = cleanLabel(subGroup) || cleanLabel(group) || categoryLabel;
  const hasDistinctCategory =
    Boolean(categoryLabel) &&
    categoryLabel.toLocaleLowerCase("uk-UA") !==
      productGroupLabel.toLocaleLowerCase("uk-UA");
  const subject = lowerFirst(productGroupLabel || "автозапчастини");

  // Deliberately no product name/producer/article/price here — the name
  // already leads the <title> tag right above this in a SERP snippet (and
  // the H1 on-page), so repeating it just burns the ~150-char budget on a
  // duplicate; price/availability belong in the Offer's own JSON-LD fields
  // (see `offers` below) which search engines read as a separate indicator,
  // not as prose duplicated into the description.
  return trimSeoDescription(
    [
      `Купити ${subject}${
        hasDistinctCategory ? ` із категорії «${categoryLabel}»` : ""
      } у Львові.`,
      "Перевірений асортимент товарів.",
      "вул. Перфецького, 8.",
      "Онлайн замовлення!",
    ].join(" "),
    150
  );
};

const trimSeoPhrase = (value: string, maxLength: number) => {
  const normalized = makeSeoTextTrim(value);
  if (normalized.length <= maxLength) return normalized;

  const contentMaxLength = Math.max(1, maxLength - 1);
  const slice = normalized.slice(0, contentMaxLength + 1);
  const boundary = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf(","));
  return `${stripTrailingSeoPunctuation(
    slice.slice(0, boundary > Math.floor(contentMaxLength * 0.65) ? boundary : contentMaxLength)
  )}…`;
};

const trimSeoDescription = (
  value: string,
  maxLength = PRODUCT_META_DESCRIPTION_MAX_LENGTH
) => {
  const normalized = makeSeoTextTrim(value);
  if (normalized.length <= maxLength) return normalized;

  const slice = normalized.slice(0, maxLength + 1);
  const boundary = Math.max(
    slice.lastIndexOf("."),
    slice.lastIndexOf(";"),
    slice.lastIndexOf(","),
    slice.lastIndexOf(" ")
  );
  const trimmed = slice
    .slice(0, boundary > 120 ? boundary : maxLength)
    .replace(/\s+([.,;:!?])/g, "$1");

  return `${stripTrailingSeoPunctuation(trimmed)}...`;
};

const buildProductSeoTitle = (options: {
  name: string;
  producer?: string;
  article?: string;
}) => {
  const { name, producer, article } = options;
  const baseName = buildVisibleProductName(name);
  const normalizedProducer = (producer || "").trim();
  const nameAlreadyHasProducer =
    normalizedProducer.length > 0 &&
    baseName.toLowerCase().includes(normalizedProducer.toLowerCase());
  const withProducer =
    normalizedProducer && !nameAlreadyHasProducer
      ? `${baseName} ${normalizedProducer}`
      : baseName;

  // Two different catalog lines can share the exact same name+producer text
  // (the same part sold under a shorter marketing name across several
  // internal 1C codes) — without the article, their <title> tags collide,
  // which Google treats as a duplicate-content signal. Reserve room for the
  // article first so it always survives the trim, instead of appending it
  // after truncation where it could get pushed out on longer names.
  const normalizedArticle = (article || "").trim();
  const brandSuffix = " | PartsON";
  // Keep pathological multi-code supplier values from pushing the useful
  // product name (and the site brand) out of Google's visible title.
  const titleArticle = normalizedArticle
    ? trimSeoPhrase(normalizedArticle, 20)
    : "";
  const articleSuffix = titleArticle ? ` — ${titleArticle}` : "";
  const descriptiveBudget = Math.max(
    24,
    SEO_TITLE_MAX_LENGTH - brandSuffix.length - articleSuffix.length
  );
  const descriptive = trimSeoPhrase(withProducer, descriptiveBudget) || "Автозапчастина";

  return `${descriptive}${articleSuffix}${brandSuffix}`;
};

// Cross-reference/OEM codes live in parentheses in the raw 1C name (e.g. "(LIN030104/AD030213)")
// and get stripped everywhere else — pull them out so they're still searchable as keywords.
const extractParentheticalKeywordTokens = (rawName: string) => {
  const matches = (rawName || "").match(/\(([^)]*)\)/g) || [];
  const tokens: string[] = [];

  for (const match of matches) {
    const inner = match.slice(1, -1);
    for (const part of inner.split(/[/,;|]+/)) {
      const trimmed = part.trim();
      if (trimmed.length >= 3 && !tokens.includes(trimmed)) tokens.push(trimmed);
    }
  }

  return tokens;
};

const buildProductSeoKeywords = (options: {
  productName: string;
  article: string;
  code: string;
  producer: string;
  category: string;
  description?: string;
  rawName?: string;
}) => {
  const { productName, article, code, producer, category, description, rawName } = options;

  const descriptionWords: string[] = [];
  if (description) {
    const stopWords = new Set(["що", "для", "при", "або", "але", "від", "під", "над", "між", "без", "про", "через", "після", "перед", "його", "яких", "якій", "також", "може", "якщо", "цього", "буде", "були", "щоб", "своє", "коли", "яке", "який", "інші", "всіх", "такі", "деякі", "дана", "даний", "цими"]);
    const words = description
      .split(/[\s,\.;\:\!\?\/\(\)\-–—«»"']+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 4 && !stopWords.has(w.toLowerCase()) && !/^\d+$/.test(w));
    for (const word of words) {
      if (!descriptionWords.includes(word)) descriptionWords.push(word);
    }
  }

  const crossReferenceTokens = extractParentheticalKeywordTokens(rawName || "");

  const entries = [
    productName,
    article ? `${productName} ${article}` : null,
    producer ? `${productName} ${producer}` : null,
    category ? `${productName} ${category}` : null,
    article ? `${article} купити` : null,
    code && code !== article ? `${code} купити` : null,
    producer ? `${producer} запчастини` : null,
    category ? `${category} купити` : null,
    ...crossReferenceTokens,
    ...descriptionWords,
    "автозапчастини Львів",
    "підбір запчастин за VIN",
    "PartsON",
  ];

  return Array.from(
    new Set(
      entries
        .map((entry) => (entry || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
};

const getFirstResolvedNonNull = async <T,>(promises: Array<Promise<T | null>>) => {
  if (promises.length === 0) return null;

  const attempts = promises.map((promise, index) =>
    Promise.resolve(promise)
      .then((value) => ({ index, value }))
      .catch(() => ({ index, value: null as T | null }))
  );

  const pending = new Set<number>(attempts.map((_, index) => index));
  while (pending.size > 0) {
    const result = await Promise.race(
      Array.from(pending, (index) => attempts[index])
    );
    pending.delete(result.index);
    if (result.value != null) {
      return result.value;
    }
  }

  return null;
};

const toPositiveNumberOrNull = (value: unknown) => {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const getProductSeoEuroRate = cache(async () =>
  resolveWithTimeout(() => fetchEuroRate(), 50, PRODUCT_PAGE_SEO_EURO_RATE_TIMEOUT_MS)
);

const resolveProductSeoPrice = cache(
  async (
    inlinePriceEuro: number | null | undefined
  ): Promise<{
    priceEuro: number | null;
    priceUah: number | null;
    euroRate: number | null;
  }> => {
    const inlinePrice = toPositiveNumberOrNull(inlinePriceEuro);
    if (inlinePrice == null) {
      return { priceEuro: null, priceUah: null, euroRate: null };
    }

    const priceEuro = inlinePrice;
    const euroRate = await getProductSeoEuroRate();
    const priceUah = toPriceUah(priceEuro, euroRate);

    return {
      priceEuro,
      priceUah,
      euroRate,
    };
  }
);

const buildCanonicalProductPath = (
  product: {
    code: string;
    article: string;
    name: string;
    producer: string;
    group?: string;
    subGroup?: string;
    category?: string;
  },
  fallbackCode: string
) =>
  buildProductPath({
    code: product.code || fallbackCode,
    article: product.article,
    name: product.name,
    producer: product.producer,
    group: product.group,
    subGroup: product.subGroup,
    category: product.category,
  });

const extractLookupTokensFromSeoNameSlug = (rawNameSlug: string) => {
  const normalized = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!normalized) return [] as string[];

  const parts = normalized.split("-").map((entry) => entry.trim()).filter(Boolean);
  if (parts.length === 0) return [] as string[];

  const tokens = new Set<string>();
  const addLookupToken = (
    token: string,
    options?: { minLength?: number; requireDigit?: boolean }
  ) => {
    const normalizedToken = token.replace(/^-+|-+$/g, "").trim();
    const minLength = options?.minLength ?? 3;
    if (normalizedToken.length < minLength) return;
    if (options?.requireDigit && !/\d/.test(normalizedToken)) return;
    tokens.add(normalizedToken);
  };

  for (const part of parts) {
    addLookupToken(part, { requireDigit: true });
  }

  for (let tailSize = 1; tailSize <= 6; tailSize += 1) {
    if (parts.length < tailSize) continue;
    const tailParts = parts.slice(-tailSize);
    const minLength = tailSize === 1 ? 3 : 5;
    for (const separator of ["", "-", ".", "/", " "]) {
      addLookupToken(tailParts.join(separator), { minLength });
    }
  }

  return Array.from(tokens);
};

const extractPrimaryLookupTokenFromSeoNameSlug = (rawNameSlug: string) => {
  const normalized = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!normalized) return "";

  const parts = normalized.split("-").map((entry) => entry.trim()).filter(Boolean);
  for (let tailSize = Math.min(6, parts.length); tailSize >= 2; tailSize -= 1) {
    const tailParts = parts.slice(-tailSize);
    const isNumericCodeTail = tailParts.every((part) => /^\d+$/.test(part));
    if (!isNumericCodeTail) continue;

    const hyphenatedCode = tailParts.join("-");
    if (hyphenatedCode.length >= 5) return hyphenatedCode;
    const compactCode = tailParts.join("");
    if (compactCode.length >= 5) return compactCode;
  }

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const token = parts[index];
    if (token.length < 3) continue;
    if (!/\d/.test(token)) continue;
    return token;
  }

  for (let tailSize = Math.min(6, parts.length); tailSize >= 1; tailSize -= 1) {
    const tailParts = parts.slice(-tailSize);
    const lookupToken = tailParts.join(tailSize === 1 ? "" : "-");
    if (lookupToken.length >= (tailSize === 1 ? 3 : 5)) {
      return lookupToken;
    }
  }

  return "";
};

const doesProductMatchSeoNameSlug = (
  product: NonNullable<Awaited<ReturnType<typeof getCatalogProductUncached>>>,
  rawNameSlug: string
) => {
  const requestedSlug = safeDecodeURIComponent(rawNameSlug || "").trim().toLowerCase();
  if (!requestedSlug) return false;

  const canonicalSlug = buildProductNameSlug(product).toLowerCase();
  const legacySlug = buildLegacyProductNameSlug(product).toLowerCase();
  const requestedParts = requestedSlug.split("-").filter(Boolean);
  const canUsePrefixMatch = requestedParts.length >= 2 && requestedSlug.length >= 8;

  return (
    canonicalSlug === requestedSlug ||
    legacySlug === requestedSlug ||
    (canUsePrefixMatch &&
      (canonicalSlug.startsWith(`${requestedSlug}-`) ||
        legacySlug.startsWith(`${requestedSlug}-`)))
  );
};

type ResolvedProductRouteData = {
  code: string;
  isSeoRoute: boolean;
  product: Awaited<ReturnType<typeof getCatalogProductUncached>> | null;
};

const buildUniqueLookupTokens = (rawNameSlug: string) =>
  [
    extractPrimaryLookupTokenFromSeoNameSlug(rawNameSlug),
    ...extractLookupTokensFromSeoNameSlug(rawNameSlug),
  ].filter((token, index, array) => Boolean(token) && array.indexOf(token) === index);

const isPlausibleProductLookupToken = (token: string) => {
  const normalized = (token || "").trim();
  return normalized.length >= 4 && /\d/.test(normalized);
};

const normalizeProductLookupToken = (value: string) =>
  (value || "").trim().toLowerCase();

const compactProductLookupToken = (value: string) =>
  normalizeProductLookupToken(value).replace(/[\s./_-]+/g, "");

const normalizeProductRouteLookupParam = (value: string) =>
  safeDecodeURIComponent(value || "").trim().toLowerCase();

// `react`'s cache() only dedupes within a single request's render pass, not
// across requests — with ~10k catalog entries, rebuilding this Map from the
// snapshot file on every product-page hit was the main source of the slow
// streamed response. The snapshot only changes on redeploy (new build writes
// a fresh file, pm2 restart starts a fresh process), so a plain module-level
// singleton is safe and shared across every request for the process lifetime.
let sitemapProductLookupIndexPromise: Promise<Map<string, CatalogProduct>> | null =
  null;

const buildSitemapProductLookupIndex = async () => {
  const snapshotEntries = await getAllProductSitemapSnapshotEntries().catch(
    () => []
  );
  const entries = snapshotEntries.length > 0
    ? snapshotEntries
    : shouldPreferSitemapProductLookup
      ? await getAllPricedProductSitemapEntries().catch(() => [])
      : await getAllProductSitemapEntries().catch(() => []);
  const index = new Map<string, CatalogProduct>();

  for (const entry of entries) {
    const product = buildCatalogProductFromSitemapEntry(entry);
    const routeParam = normalizeProductRouteLookupParam(
      buildProductPath({
        code: entry.code,
        article: entry.article,
        name: entry.name,
        producer: entry.producer,
        group: entry.group,
        subGroup: entry.subGroup,
        category: entry.category,
      }).replace(/^\/product\//, "")
    );

    if (routeParam && !index.has(`route:${routeParam}`)) {
      index.set(`route:${routeParam}`, product);
    }

    for (const candidate of [entry.article || "", entry.code || ""]) {
      const direct = normalizeProductLookupToken(candidate);
      const compact = compactProductLookupToken(candidate);
      if (direct && !index.has(`direct:${direct}`)) {
        index.set(`direct:${direct}`, product);
      }
      if (compact && !index.has(`compact:${compact}`)) {
        index.set(`compact:${compact}`, product);
      }
    }
  }

  return index;
};

const getSitemapProductLookupIndex = () => {
  if (!sitemapProductLookupIndexPromise) {
    sitemapProductLookupIndexPromise = buildSitemapProductLookupIndex().catch(
      (error) => {
        sitemapProductLookupIndexPromise = null;
        throw error;
      }
    );
  }
  return sitemapProductLookupIndexPromise;
};

const findSitemapProductByLookupTokens = cache(async (lookupTokens: string[]) => {
  const normalizedTokens = Array.from(
    new Set(
      lookupTokens
        .map((token) => token.trim())
        .filter(isPlausibleProductLookupToken)
    )
  );
  if (normalizedTokens.length === 0) return null;

  const index = await getSitemapProductLookupIndex();

  for (const token of normalizedTokens) {
    const direct = normalizeProductLookupToken(token);
    const compact = compactProductLookupToken(token);
    const matched =
      index.get(`direct:${direct}`) || index.get(`compact:${compact}`) || null;
    if (matched) return matched;
  }

  return null;
});

const findSitemapProductByRouteParam = cache(async (rawParam: string) => {
  const routeParam = normalizeProductRouteLookupParam(rawParam);
  if (!routeParam) return null;

  const index = await getSitemapProductLookupIndex();
  return index.get(`route:${routeParam}`) || null;
});

const findCatalogProductByLookupToken = async (token: string) => {
  if (shouldPreferSitemapProductLookup) {
    const sitemapMatch = await findSitemapProductByLookupTokens([token]).catch(
      () => null
    );
    if (sitemapMatch) return sitemapMatch;
  }

  const fastMatch = await getFirstResolvedNonNull([
    findCatalogProductByCode(
      token,
      {
        ...FAST_PRODUCT_CATALOG_LOOKUP_OPTIONS,
        timeoutMs: 850,
        lookupLimit: 8,
        exactOnly: true,
      }
    ).catch(() => null),
    findCatalogProductByArticleFast(token).catch(() => null),
  ]);

  if (fastMatch) {
    return fastMatch;
  }

  return getCatalogProduct(token).catch(() => null);
};

const resolveProductFromSeoNameSlug = async (rawNameSlug: string) => {
  const lookupTokens = buildUniqueLookupTokens(rawNameSlug);

  for (const token of lookupTokens) {
    const matchedProduct = await findCatalogProductByLookupToken(token);
    const matchedCode = (matchedProduct?.code || matchedProduct?.article || "").trim();
    if (!matchedProduct || !matchedCode) continue;
    if (!doesProductMatchSeoNameSlug(matchedProduct, rawNameSlug)) continue;

    return {
      code: matchedCode,
      product: matchedProduct,
    };
  }

  return null;
};

const resolveProductCodeFromRouteParamUncached = async (rawCode: string) => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
  if (routeSlugs) {
    const matchedProductRoute = await resolveProductFromSeoNameSlug(routeSlugs.nameSlug);
    if (matchedProductRoute) {
      return {
        code: matchedProductRoute.code,
        isSeoRoute: true,
        product: matchedProductRoute.product,
      };
    }

    const resolvedCode = await resolveProductCodeFromSeoRoute(
      routeSlugs.groupSlug,
      routeSlugs.nameSlug
    );
    if (resolvedCode) {
      return {
        code: resolvedCode,
        isSeoRoute: true,
        product: null,
      };
    }

    const resolvedCodeByNameSlug = await resolveProductCodeFromNameSlug(
      routeSlugs.nameSlug
    );
    if (resolvedCodeByNameSlug) {
      return {
        code: resolvedCodeByNameSlug,
        isSeoRoute: true,
        product: null,
      };
    }

    return {
      code: "",
      isSeoRoute: false,
      product: null,
    };
  }

  const directCode = extractProductCodeFromParam(rawCode || "");
  // When the URL is in CODE~slug format, directCode is the prefix before "~" and
  // differs from the full decodedParam. In that case the decodedParam is not a valid
  // name slug — skip slug-based resolution entirely to avoid burning the resolver
  // budget on a guaranteed-miss global catalog scan.
  const hasCodePrefix = Boolean(directCode) && directCode !== decodedParam;
  // Pure numeric-dash codes (e.g. "00-00000100") are direct 1C codes, not SEO slugs.
  const isDirectNumericCode = !hasCodePrefix && /^\d{2,}-\d{4,}$/.test(decodedParam);
  const looksLikeSeoNameSlug =
    !hasCodePrefix && !isDirectNumericCode && decodedParam.includes("-") && !decodedParam.includes("~");
  const directProduct = directCode && !looksLikeSeoNameSlug
    ? await findCatalogProductByLookupToken(directCode)
    : null;
  const directProductCode = (directProduct?.code || directProduct?.article || "").trim();
  if (directProductCode) {
    return {
      code: directProductCode,
      isSeoRoute: false,
      product: directProduct,
    };
  }

  if (!hasCodePrefix) {
    const matchedProductRoute = await resolveProductFromSeoNameSlug(decodedParam);
    if (matchedProductRoute) {
      return {
        code: matchedProductRoute.code,
        isSeoRoute: true,
        product: matchedProductRoute.product,
      };
    }

    const resolvedCodeByNameSlug = await resolveProductCodeFromNameSlug(decodedParam);
    if (resolvedCodeByNameSlug) {
      return {
        code: resolvedCodeByNameSlug,
        isSeoRoute: true,
        product: null,
      };
    }
  }

  // directCode was extracted from the URL but no product was confirmed in the
  // catalog via any lookup path. Return empty code so the caller can apply
  // canUseDirectFallbackCode heuristics rather than always showing a fallback page.
  return {
    code: "",
    isSeoRoute: false,
    product: null,
  };
};

const resolveProductCodeFromRouteParamCached = unstable_cache(
  resolveProductCodeFromRouteParamUncached,
  ["product-page:resolve-route-v13-article-slug-variants"],
  { revalidate: 900, tags: ["product-page-data"] }
);

const resolveProductCodeFromRouteParam = cache(async (rawCode: string) => {
  const cachedRouteData = await resolveProductCodeFromRouteParamCached(rawCode);
  if (cachedRouteData.code) {
    return cachedRouteData;
  }

  return resolveProductCodeFromRouteParamUncached(rawCode);
});

const getResolvedProductRouteDataUncached = async (
  rawCode: string
): Promise<ResolvedProductRouteData> => {
  const resolvedRoute = await resolveProductCodeFromRouteParam(rawCode);
  if (!resolvedRoute.code) {
    return {
      code: "",
      isSeoRoute: resolvedRoute.isSeoRoute,
      product: null,
    };
  }

  if (resolvedRoute.product) {
    return {
      code: resolvedRoute.code,
      isSeoRoute: resolvedRoute.isSeoRoute,
      product: resolvedRoute.product,
    };
  }

  return {
    code: resolvedRoute.code,
    isSeoRoute: resolvedRoute.isSeoRoute,
    product: await getCatalogProduct(resolvedRoute.code),
  };
};

const getResolvedProductRouteDataCached = unstable_cache(
  getResolvedProductRouteDataUncached,
  ["product-page:resolved-route-product-v13-article-slug-variants"],
  { revalidate: 900, tags: ["product-page-data"] }
);

const getResolvedProductRouteData = cache(async (rawCode: string) => {
  const cachedRouteData = await getResolvedProductRouteDataCached(rawCode);
  if (cachedRouteData.code) {
    return cachedRouteData;
  }

  return getResolvedProductRouteDataUncached(rawCode);
});

const canUseDirectProductCodeFallback = (rawCode: string) => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  if (!decodedParam) return false;
  if (extractProductRouteSlugsFromParam(decodedParam)) return false;

  // Pure numeric code with dashes (e.g. "00-00000100") — standard 1C internal code format.
  // These are not SEO slugs: no letters, so there is no name/article ambiguity.
  if (/^\d{2,}-\d{4,}$/.test(decodedParam)) return true;

  return decodedParam.includes("~") || !decodedParam.includes("-");
};

const resolveProductRouteDataFromSitemapParam = cache(
  async (rawCode: string): Promise<ResolvedProductRouteData | null> => {
    const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
    if (!decodedParam) return null;

    const routeProduct = await findSitemapProductByRouteParam(decodedParam).catch(
      () => null
    );
    const routeProductCode = (routeProduct?.code || routeProduct?.article || "").trim();
    if (routeProduct && routeProductCode) {
      return {
        code: routeProductCode,
        isSeoRoute: true,
        product: routeProduct,
      };
    }

    const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
    const canUseDirectFallbackCode = canUseDirectProductCodeFallback(decodedParam);
    const lookupSource =
      routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? decodedParam : "");
    const lookupTokens = lookupSource ? buildUniqueLookupTokens(lookupSource) : [];
    if (lookupTokens.length === 0) return null;

    const product = await findSitemapProductByLookupTokens(lookupTokens).catch(
      () => null
    );
    const code = (product?.code || product?.article || "").trim();
    if (!product || !code) return null;

    return {
      code,
      isSeoRoute: Boolean(lookupSource),
      product,
    };
  }
);

const recoverProductRouteDataFromNameSlug = async (
  rawCode: string
): Promise<ResolvedProductRouteData | null> => {
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  if (!decodedParam || extractProductRouteSlugsFromParam(decodedParam)) return null;

  const recoveredRoute = await resolveWithTimeout(
    () => resolveProductFromSeoNameSlug(decodedParam),
    null,
    PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
  );
  if (recoveredRoute?.code) {
    return {
      code: recoveredRoute.code,
      isSeoRoute: true,
      product: recoveredRoute.product,
    };
  }

  const recoveredCode = await resolveWithTimeout(
    () => resolveProductCodeFromNameSlug(decodedParam),
    null,
    PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
  );
  if (!recoveredCode) return null;

  const recoveredProduct = await resolveWithTimeout(
    () => getCatalogProduct(recoveredCode),
    null,
    PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
  );

  return {
    code: recoveredCode,
    isSeoRoute: true,
    product: recoveredProduct,
  };
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { code: rawCode } = await params;
  const isModalView = false;
  const decodedParam = safeDecodeURIComponent(rawCode || "").trim();
  const routeSlugs = extractProductRouteSlugsFromParam(decodedParam);
  const fallbackCode = extractProductCodeFromParam(decodedParam);
  const canUseDirectFallbackCode = canUseDirectProductCodeFallback(rawCode || "");
  let routeData =
    shouldPreferSitemapProductLookup
      ? (await resolveProductRouteDataFromSitemapParam(rawCode || "")) ?? {
          code: "",
          isSeoRoute: false,
          product: null,
        }
      : await resolveWithTimeout(
          () => getResolvedProductRouteData(rawCode || ""),
          { code: "", isSeoRoute: false, product: null },
          PRODUCT_PAGE_METADATA_ROUTE_DATA_TIMEOUT_MS
        );
  if (!routeData.code && canUseDirectFallbackCode && fallbackCode) {
    const directProduct = await resolveWithTimeout(
      () => getCatalogProduct(fallbackCode),
      null,
      700
    );
    if (directProduct) {
      routeData = {
        code: (directProduct.code || directProduct.article || fallbackCode).trim(),
        isSeoRoute: false,
        product: directProduct,
      };
    }
  }
  if (!routeData.code) {
    const metadataLookupSource = routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? decodedParam : "");
    const metadataLookupTokens = metadataLookupSource
      ? buildUniqueLookupTokens(metadataLookupSource)
      : [];
    const sitemapProduct = await resolveWithTimeout(
      () => findSitemapProductByLookupTokens(metadataLookupTokens),
      null,
      650
    );
    if (sitemapProduct) {
      routeData = {
        code: (sitemapProduct.code || sitemapProduct.article || "").trim(),
        isSeoRoute: Boolean(metadataLookupSource),
        product: sitemapProduct,
      };
    }
  }

  const routeProduct = routeData.product;
  const resolvedCode = (routeData.code || fallbackCode || "").trim();
  const fallbackTitleSource =
    routeSlugs?.nameSlug || resolvedCode || decodedParam || "Товар";
  const productProducer = (routeProduct?.producer || "").trim();
  const productArticle = (routeProduct?.article || "").trim();
  const productCategory = (routeProduct?.category || "").trim();
  const productGroup = (routeProduct?.group || productCategory || "").trim();
  const productSubGroup = (routeProduct?.subGroup || "").trim();
  const seoVisibleProductName = buildPureProductName(
    routeProduct?.name || buildReadableNameFromSlugSource(fallbackTitleSource),
    {
      producer: productProducer,
      article: productArticle,
      group: productGroup,
      subGroup: productSubGroup,
    }
  );
  const categoryLabel = buildVisibleProductName(productSubGroup || productGroup || productCategory);
  const canonicalPath = routeProduct
    ? buildCanonicalProductPath(routeProduct, resolvedCode || fallbackCode)
    : `/product/${encodeURIComponent(decodedParam || resolvedCode || fallbackCode || "")}`;

  const productImagePath = routeProduct?.hasPhoto === true
    ? buildProductSeoImagePath(routeProduct.code || resolvedCode, routeProduct.article)
    : PRODUCT_IMAGE_FALLBACK_PATH;
  const siteUrl = getSiteUrl();
  const productImageUrl = `${siteUrl}${productImagePath}`;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  const shouldIndexProduct =
    !isModalView && Boolean(routeProduct) && isPublicCatalogProduct(routeProduct);

  const inlinePriceEuroForMeta = toPositiveNumberOrNull(routeProduct?.priceEuro);
  const seoPriceForMeta = await resolveProductSeoPrice(inlinePriceEuroForMeta);

  const seoTitle = buildProductSeoTitle({
    name: seoVisibleProductName,
    producer: productProducer,
    article: productArticle,
  });

  const description = buildProductMetaDescription({
    category: productCategory || productGroup,
    group: productCategory ? productGroup : productSubGroup,
    subGroup: productCategory ? productSubGroup : "",
  });

  const keywords = buildProductSeoKeywords({
    productName: seoVisibleProductName,
    article: productArticle,
    code: resolvedCode,
    producer: productProducer,
    category: categoryLabel,
    description: routeProduct?.description,
    rawName: routeProduct?.name,
  });

  return {
    metadataBase: new URL(siteUrl),
    title: {
      absolute: seoTitle,
    },
    description,
    keywords,
    alternates: {
      canonical: canonicalPath,
      languages: {
        "uk-UA": canonicalPath,
        "x-default": canonicalPath,
      },
    },
    category: "auto parts",
    openGraph: {
      // "article" is for blog/news content — wrong type for a product page,
      // and Next.js's OpenGraphType union has no "product" option (that
      // needs the OG product namespace declared on <html>, which isn't set
      // up here). "website" is the correct safe default for product pages.
      type: "website",
      url: canonicalUrl,
      title: seoTitle,
      description,
      images: [{
        url: productImageUrl,
        alt: `${seoVisibleProductName}${productArticle ? ` арт. ${productArticle}` : ""} — автозапчастина PartsON`,
      }],
      siteName: "PartsON",
      locale: "uk_UA",
    },
    twitter: {
      card: "summary_large_image",
      title: seoTitle,
      description,
      images: [{ url: productImageUrl, alt: `${seoVisibleProductName}${productArticle ? ` арт. ${productArticle}` : ""} — автозапчастина PartsON` }],
    },
    robots: {
      index: shouldIndexProduct,
      follow: true,
      googleBot: {
        index: shouldIndexProduct,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    other: {
      "product:retailer_item_id": resolvedCode || productArticle,
      "product:brand": productProducer,
      "product:category": categoryLabel,
      ...(seoPriceForMeta.priceUah != null
        ? {
            "product:price:amount": String(seoPriceForMeta.priceUah),
            "product:price:currency": "UAH",
          }
        : {}),
      "product:availability":
        routeProduct && routeProduct.quantity > 0 ? "in stock" : "out of stock",
      "geo.region": "UA-46",
      "geo.placename": "Львів",
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { code: rawCode } = await params;
  const routeSlugs = extractProductRouteSlugsFromParam(rawCode || "");
  const fallbackCodeFromRoute = extractProductCodeFromParam(rawCode || "");
  const canUseDirectFallbackCode = canUseDirectProductCodeFallback(rawCode || "");
  const routeLookupSource = routeSlugs?.nameSlug || (!canUseDirectFallbackCode ? rawCode || "" : "");
  const routeLookupTokens = routeLookupSource ? buildUniqueLookupTokens(routeLookupSource) : [];
  const primaryRouteLookupToken =
    routeLookupTokens.find(isPlausibleProductLookupToken) || "";
  const sitemapRouteDataPromise = shouldPreferSitemapProductLookup
    ? resolveProductRouteDataFromSitemapParam(rawCode || "")
    : null;
  let directCodeProductPromise: Promise<CatalogProduct | null> | null = null;
  // Direct 1C lookup is delayed until the local sitemap snapshot misses.
  if (
    !shouldPreferSitemapProductLookup &&
    canUseDirectFallbackCode &&
    fallbackCodeFromRoute
  ) {
    directCodeProductPromise = getCatalogProduct(fallbackCodeFromRoute).catch(() => null);
  }
  const slugRecoveredProductPromise = primaryRouteLookupToken
    ? shouldPreferSitemapProductLookup
      ? findSitemapProductByLookupTokens(routeLookupTokens).catch(() => null)
      : getFirstResolvedNonNull<CatalogProduct>([
          getCatalogProduct(primaryRouteLookupToken).catch(() => null),
          findSitemapProductByLookupTokens(routeLookupTokens).catch(() => null),
        ])
    : null;
  const sitemapRouteData = await sitemapRouteDataPromise;
  let routeData =
    sitemapRouteData ??
    (canUseDirectFallbackCode && fallbackCodeFromRoute && !routeSlugs
      ? {
          code: "",
          isSeoRoute: false,
          product: null,
        }
      : await resolveWithTimeout(
          () => getResolvedProductRouteData(rawCode || ""),
          {
            code: "",
            isSeoRoute: false,
            product: null,
          },
          PRODUCT_PAGE_ROUTE_DATA_TIMEOUT_MS
        ));
  if (!routeData.code) {
    const recoveredRouteData = await resolveWithTimeout(
      () => recoverProductRouteDataFromNameSlug(rawCode || ""),
      null,
      PRODUCT_PAGE_ROUTE_RECOVERY_TIMEOUT_MS
    );
    if (recoveredRouteData?.code) {
      routeData = recoveredRouteData;
    }
  }

  let resolvedCode = (routeData.code || (canUseDirectFallbackCode ? fallbackCodeFromRoute : "") || "").trim();
  let product = routeData.product;

  // Reviews and gallery only depend on the resolved code string, not on the
  // (possibly fresher) product object below — and in the common case
  // (sitemap already gave us both a code and a product), resolvedCode here
  // is already final; every fallback branch between here and the later
  // notFound() check is gated on `!resolvedCode`/`!product` and is a no-op
  // once those are already set. So it's safe to fire these Firestore reads
  // now, in parallel with the freshProduct 1C refresh below, instead of
  // waiting for that to finish first — the two 900ms-capped waits then
  // overlap instead of adding up to ~1.8s of pure sequential wait. The
  // later declaration re-checks resolvedCode/product didn't change before
  // reusing these, and falls back to a fresh fetch on the rare recovery
  // path where they did.
  const earlyResolvedCode = resolvedCode;
  const earlyHasProduct = Boolean(product);
  const earlyReviewsPromise = earlyResolvedCode
    ? Promise.all([
        getProductReviewStats(earlyResolvedCode),
        getProductReviews(earlyResolvedCode),
      ]).catch(() => [null, null] as const)
    : null;
  const earlyGalleryImagesPromise = earlyResolvedCode
    ? fetchProductGalleryImageUrls(earlyResolvedCode).catch(() => [])
    : null;

  if (resolvedCode) {
    // A live 1C lookup here (name/price/quantity refresh) routinely takes
    // 1.9-3.7s — the documented per-call latency elsewhere in this file.
    // When the sitemap snapshot already gave us a product to show, that's
    // real, recently-indexed data, not a placeholder — it's worth a short
    // wait for something fresher, but not worth blocking the whole page's
    // TTFB on 1C's full budget. The purchase panel already re-verifies price
    // live client-side (see ProductPurchasePanelClient's own /api/product-
    // price fetch), so a slightly-stale SSR price here self-corrects within
    // a second of hydration regardless. Only when there's no fallback to
    // show at all does this still need the full budget.
    const freshProductTimeoutMs = product
      ? PRODUCT_PAGE_PRODUCT_REFRESH_TIMEOUT_MS
      : PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS;
    const freshProduct = await resolveWithTimeout(
      () =>
        directCodeProductPromise && resolvedCode === fallbackCodeFromRoute
          ? directCodeProductPromise
          : getCatalogProduct(resolvedCode),
      null,
      freshProductTimeoutMs
    );
    if (freshProduct) product = freshProduct;
  }

  if (!resolvedCode && canUseDirectFallbackCode && fallbackCodeFromRoute) {
    const directFallbackProduct = await resolveWithTimeout(
      () => directCodeProductPromise || getCatalogProduct(fallbackCodeFromRoute),
      null,
      PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
    );
    if (directFallbackProduct) {
      product = directFallbackProduct;
      resolvedCode = (directFallbackProduct.code || directFallbackProduct.article || fallbackCodeFromRoute).trim();
    }
  }

  if (!resolvedCode && !canUseDirectFallbackCode && !routeSlugs) {
    const legacySlugLookupToken = primaryRouteLookupToken || extractPrimaryLookupTokenFromSeoNameSlug(rawCode || "");
    if (legacySlugLookupToken) {
      const legacyFallbackProduct = await resolveWithTimeout(
        () => slugRecoveredProductPromise || getCatalogProduct(legacySlugLookupToken),
        null,
        PRODUCT_PAGE_PRODUCT_LOOKUP_TIMEOUT_MS
      );
      // Only accept the product if its canonical slug matches the requested URL.
      // Without this check a numeric token (e.g. "12345") could match an unrelated
      // product and cause a redirect to the wrong page.
      if (legacyFallbackProduct && doesProductMatchSeoNameSlug(legacyFallbackProduct, rawCode || "")) {
        product = legacyFallbackProduct;
        resolvedCode = (
          legacyFallbackProduct.code ||
          legacyFallbackProduct.article ||
          legacySlugLookupToken
        ).trim();
      }
    }
  }

  if (!resolvedCode) {
    // Only recover a fallback code for patterns that are plausibly real product codes:
    //   - codes without any dashes (e.g. "12345", "ABC123") — canUseDirectFallbackCode
    //   - codes/slugs that contain the "~" segment separator — canonical indexed routes
    //   - indexed routes with the "--" group/name separator — recover the embedded code
    //     from the name slug portion so API-down renders don't 404 valid URLs
    // Do NOT expand arbitrary dash-separated strings (e.g. "invalid-product-xyz")
    // into a resolved code — those should fall through to notFound().
    const recoveredToken = routeSlugs?.nameSlug
      ? extractPrimaryLookupTokenFromSeoNameSlug(routeSlugs.nameSlug)
      : primaryRouteLookupToken || null;

    resolvedCode = (
      (canUseDirectFallbackCode ? fallbackCodeFromRoute : null) ||
      (recoveredToken && isPlausibleProductLookupToken(recoveredToken)
        ? recoveredToken
        : null) ||
      ""
    ).trim();
  }

  if (!product && slugRecoveredProductPromise) {
    const recoveredProduct = await resolveWithTimeout(
      () => slugRecoveredProductPromise,
      null,
      650
    );
    if (recoveredProduct) {
      product = recoveredProduct;
      resolvedCode = (
        recoveredProduct.code ||
        recoveredProduct.article ||
        resolvedCode ||
        primaryRouteLookupToken
      ).trim();
    }
  }

  if (!resolvedCode) notFound();

  const hasResolvedCatalogProduct = Boolean(product);
  if (!product) {
    notFound();
  }

  const isModalView = false;
  const isSeoResolvedInternally = false;
  const canonicalPath = buildCanonicalProductPath(product, resolvedCode);
  const currentRouteParam = safeDecodeURIComponent(rawCode || "").trim();
  const canonicalRouteParam = safeDecodeURIComponent(
    canonicalPath.replace(/^\/product\//, "")
  ).trim();

  if (
    hasResolvedCatalogProduct &&
    !isSeoResolvedInternally &&
    currentRouteParam !== canonicalRouteParam
  ) {
    permanentRedirect(canonicalPath);
  }

  const primaryLookupKey =
    product.article.trim() || product.code.trim() || resolvedCode;
  const lookupKeys = isModalView
    ? [primaryLookupKey]
    : Array.from(
        new Set([product.article.trim(), product.code.trim(), resolvedCode].filter(Boolean))
      );
  const inlineInitialPriceEuro = toPositiveNumberOrNull(product.priceEuro);
  const shouldEmitProductStructuredData = !isModalView && hasResolvedCatalogProduct;
  const productCategory = (product.category || "").trim();
  const productGroup = (product.group || productCategory || "").trim();
  const productSubgroup = (product.subGroup || "").trim();
  const visibleProductName = buildPureProductName(product.name, {
    producer: product.producer,
    article: product.article,
    group: productGroup,
    subGroup: productSubgroup,
  });
  const visibleProductGroup = buildVisibleCategoryLabel(productGroup);
  const visibleProductSubgroup = buildVisibleCategoryLabel(productSubgroup);
  const siteUrl = getSiteUrl();
  // Reuse the promises kicked off before the freshProduct refetch when
  // nothing that would change their inputs happened in between (the
  // common case) — only fall back to firing them fresh here on the rare
  // recovery path where resolvedCode/product changed after that point.
  const canReuseEarlyPromises =
    earlyHasProduct && resolvedCode === earlyResolvedCode;
  const reviewsPromise: Promise<
    readonly [
      Awaited<ReturnType<typeof getProductReviewStats>>,
      ProductReview[] | null,
    ]
  > =
    canReuseEarlyPromises && earlyReviewsPromise
      ? earlyReviewsPromise
      : resolvedCode
        ? Promise.all([
            getProductReviewStats(resolvedCode),
            getProductReviews(resolvedCode),
          ]).catch(() => [null, null] as const)
        : Promise.resolve([null, []]);
  const galleryImagesPromise =
    canReuseEarlyPromises && earlyGalleryImagesPromise
      ? earlyGalleryImagesPromise
      : fetchProductGalleryImageUrls(resolvedCode).catch(() => []);
  const [pagePrice, brandLogoMap] = await Promise.all([
    resolveProductSeoPrice(inlineInitialPriceEuro),
    getBrandLogoMap().catch(() => new Map<string, string>()),
  ]);
  const initialPriceUah = pagePrice.priceUah;
  const recommendationEuroRate = pagePrice.euroRate ?? undefined;
  const initialCostPriceUah =
    product.costPriceEuro != null && pagePrice.euroRate != null
      ? toPriceUah(product.costPriceEuro, pagePrice.euroRate)
      : null;
  const schemaDescription = buildProductMetaDescription({
    category: productCategory || productGroup,
    group: productCategory ? productGroup : productSubgroup,
    subGroup: productCategory ? productSubgroup : "",
  });
  const categoryCatalogGroupValue =
    productGroup || productCategory || productSubgroup;
  const categoryCatalogSubcategoryValue =
    productSubgroup || undefined;
  const groupSeoFallbackPath = productGroup
    ? buildProductGroupLandingFallbackPath(productCategory, productGroup)
    : null;
  const producerLandingPath = product.producer
    ? buildManufacturerPath(product.producer)
    : null;
  const producerLogoPath = product.producer
    ? resolveProducerLogo(product.producer, brandLogoMap)
    : null;
  const categoryCatalogPath = categoryCatalogGroupValue
    ? buildCatalogCategoryPath(categoryCatalogGroupValue, categoryCatalogSubcategoryValue)
    : "/katalog";
  const groupLandingPath = groupSeoFallbackPath;
  const categoryLandingPath = productSubgroup
    ? buildProductGroupLandingFallbackPath(productCategory || productGroup, productSubgroup)
    : groupSeoFallbackPath;
  const categoryLandingHref =
    categoryLandingPath ||
    groupLandingPath ||
    groupSeoFallbackPath ||
    categoryCatalogPath;
  const topCategoryPath =
    productCategory &&
    productCategory.toLowerCase() !== productGroup.toLowerCase()
      ? buildGroupPath(productCategory)
      : null;
  const canonicalUrl = `${siteUrl}${canonicalPath}`;
  // Only confirmed catalog photos are safe for Google-facing image URLs. An
  // unknown/false flag must never turn the generic fallback logo into a
  // product image in Product/ItemPage structured data.
  const productHasKnownPhoto = product.hasPhoto === true;
  const productSeoImagePath = productHasKnownPhoto
    ? buildProductSeoImagePath(product.code || resolvedCode, product.article)
    : PRODUCT_IMAGE_FALLBACK_PATH;
  const productSeoImageUrl = `${siteUrl}${productSeoImagePath}`;
  // reviewsPromise and galleryImagesPromise were both kicked off earlier
  // (right after resolvedCode became available) and are unrelated Firestore
  // reads — awaiting their per-promise timeouts back-to-back added up to an
  // extra PRODUCT_PAGE_REVIEWS_TIMEOUT_MS of pure wait on the tail case
  // where both are slow, instead of the two timeouts overlapping.
  const [[reviewStats, initialReviews], galleryImageUrls] = await Promise.all([
    resolveWithTimeout<
      readonly [Awaited<ReturnType<typeof getProductReviewStats>>, ProductReview[] | null]
    >(() => reviewsPromise, [null, null], PRODUCT_PAGE_REVIEWS_TIMEOUT_MS),
    resolveWithTimeout(() => galleryImagesPromise, [], PRODUCT_PAGE_GALLERY_TIMEOUT_MS),
  ]);
  // Google's Product rich-result eligibility requires at least one of
  // offers/review/aggregateRating. A price-on-request product with no
  // reviews yet would otherwise ship a Product block with none of the
  // three, which Search Console flags as invalid — skip emitting it rather
  // than publish an incomplete schema.
  const hasProductSchemaSignal =
    initialPriceUah != null ||
    Boolean(initialReviews && initialReviews.length > 0) ||
    Boolean(reviewStats && reviewStats.ratingCount >= 3);
  const jsonLd = shouldEmitProductStructuredData && productHasKnownPhoto && hasProductSchemaSignal
    ? buildProductJsonLd({
        name: product.name,
        visibleName: visibleProductName,
        description: schemaDescription,
        code: product.code,
        article: product.article,
        producer: product.producer,
        group: productGroup,
        subGroup: productSubgroup,
        quantity: product.quantity,
        priceUah: initialPriceUah,
        canonicalUrl,
        imageUrls: [productSeoImageUrl, ...galleryImageUrls],
        aggregateRating: reviewStats ?? undefined,
        reviews: initialReviews ?? undefined,
      })
    : null;
  const itemPageJsonLd = buildProductItemPageJsonLd({
    siteUrl,
    canonicalUrl,
    name: visibleProductName,
    description: schemaDescription,
    imageUrl: productHasKnownPhoto ? productSeoImageUrl : "",
    hasProductSchema: Boolean(jsonLd),
  });
  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd({
    siteUrl,
    canonicalUrl,
    name: visibleProductName,
    topCategoryName: topCategoryPath ? buildVisibleProductName(productCategory) : undefined,
    topCategoryPath: topCategoryPath || undefined,
    groupName: productGroup || undefined,
    groupPath: groupLandingPath,
    subGroupName: productSubgroup || undefined,
    subGroupPath: productSubgroup ? categoryLandingHref : null,
  });
  const isInStock = Number.isFinite(product.quantity) && product.quantity > 0;
  const faqJsonLd = !isModalView
    ? buildProductFaqJsonLd({
        name: visibleProductName,
        producer: product.producer,
        group: productGroup,
        subGroup: productSubgroup,
        hasPrice: initialPriceUah != null,
        quantity: product.quantity,
      })
    : null;
  const contentGridClass = isModalView
    ? "grid gap-2.5 p-2.5 sm:p-3"
    : "grid gap-3 p-2.5 sm:gap-3.5 sm:p-3.5 lg:p-4";
  const heroProductImageClass = isModalView
    ? "mx-auto aspect-square w-full max-w-[260px] rounded-[18px] border border-cyan-400/18 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.98))]"
    : "mx-auto aspect-square w-full max-w-[360px] rounded-[20px] border border-sky-100/70 bg-[radial-gradient(circle_at_top,rgba(224,242,254,0.9),rgba(255,255,255,0.98)_48%,rgba(241,245,249,0.96))] sm:max-w-[460px] lg:max-w-[520px]";
  const descriptionTextClass = isModalView
    ? "mt-1.5 space-y-2 break-words text-sm font-medium leading-relaxed text-slate-700"
    : "mt-2.5 space-y-2.5 break-words text-[14px] font-medium leading-[1.62] text-slate-700 sm:text-[15px]";
  const chatPrefillMessage = [
    "Потрібна консультація по товару:",
    product.name,
    product.code ? `Код: ${product.code}` : null,
    product.article ? `Артикул: ${product.article}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const breadcrumbItems = ([
    { href: "/", label: "Головна" },
    { href: "/katalog", label: "Каталог" },
    topCategoryPath
      ? { href: topCategoryPath, label: buildVisibleProductName(productCategory) }
      : null,
    groupLandingPath && productGroup
      ? { href: groupLandingPath, label: visibleProductGroup }
      : null,
    productSubgroup &&
    productSubgroup.toLowerCase() !== (productGroup || "").toLowerCase()
      ? { href: categoryLandingHref, label: visibleProductSubgroup }
      : null,
  ].filter(Boolean) as Array<{ href: string; label: string }>).filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.href === item.href) === index
  );
  const normalizedProductArticle = hasResolvedCatalogProduct
    ? (product.article || "").trim()
    : "";
  const normalizedProductCode = (product.code || resolvedCode || "").trim();
  const hasDistinctProductCode =
    Boolean(normalizedProductArticle) &&
    Boolean(normalizedProductCode) &&
    normalizedProductArticle.toLowerCase() !== normalizedProductCode.toLowerCase();
  const productIdentifierLabel = normalizedProductArticle
    ? hasDistinctProductCode
      ? "Артикул"
      : "Артикул / код"
    : normalizedProductCode
      ? "Код товару"
      : "Ідентифікатор";
  const productIdentifierValue =
    normalizedProductArticle || normalizedProductCode || "-";
  const productIdentifierHint = hasDistinctProductCode
    ? `Код товару: ${normalizedProductCode}`
    : null;
  const productHeadingText = buildFrontendProductHeading(product.name, {
    producer: product.producer,
    article: product.article,
    group: productGroup,
    subGroup: productSubgroup,
  });
  const productFitmentText =
    "Не впевнені у сумісності? Надішліть VIN або дані автомобіля в чат — менеджер перевірить деталь і за потреби запропонує аналог.";
  const productHeroHighlights = [
    {
      label: "Перевіримо за VIN",
      icon: ShieldCheck,
    },
    {
      label: "Самовивіз у Львові",
      icon: MapPin,
    },
    {
      label: "Доставка 1–3 дні",
      icon: Truck,
    },
  ];
  return (
    <div
      className={isModalView ? "min-h-screen bg-white text-slate-900" : "min-h-screen text-slate-900"}
      style={isModalView ? undefined : pageBackground}
    >
      <div
        className={
          isModalView
            ? "mx-auto w-full max-w-[1080px] px-2 py-2 sm:px-3 sm:py-3"
            : "page-shell-inline py-2.5 sm:py-4"
        }
      >
        <article
          className={`overflow-hidden border border-slate-200/80 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)] ${
            isModalView ? "rounded-2xl" : "rounded-[24px] sm:rounded-[32px]"
          }`}
        >
          <header className="relative overflow-hidden border-b border-slate-200/80 bg-[linear-gradient(145deg,#f8fbff_0%,#ffffff_48%,#f0fdfa_100%)] px-3 pb-4 pt-3 sm:px-5 sm:pb-6 sm:pt-4 lg:px-7 lg:pb-7">
            <div className="pointer-events-none absolute -right-24 -top-28 h-80 w-80 rounded-full bg-sky-200/30 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -left-24 h-72 w-72 rounded-full bg-teal-100/50 blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-[linear-gradient(90deg,#0ea5e9,#22d3ee_45%,#14b8a6)]" />

            <div className="relative mx-auto max-w-[1280px]">
              {!isModalView && (
                <nav aria-label="Навігаційні хлібні крихти" className="mb-3 sm:mb-4">
                  <ol className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-1 text-[11px] font-semibold text-slate-500 [scrollbar-width:none] sm:text-[12px] [&::-webkit-scrollbar]:hidden">
                    {breadcrumbItems.map((item, index) => (
                      <li
                        key={`${item.href}:${item.label}:${index}`}
                        className="inline-flex items-center gap-1"
                      >
                        {index > 0 ? (
                          <ChevronRight size={13} className="text-slate-300" aria-hidden="true" />
                        ) : null}
                        <Link href={item.href} className="rounded-md px-1.5 py-1 transition hover:bg-white hover:text-sky-700">
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </nav>
              )}

              <div className="grid gap-3 sm:gap-4 lg:grid-cols-[minmax(340px,0.92fr)_minmax(0,1.08fr)] lg:gap-x-6 lg:gap-y-4 xl:grid-cols-[minmax(410px,0.9fr)_minmax(0,1.1fr)] xl:gap-x-8">
                {/* Photo first on mobile (order-1) — the standard "see the
                    product before reading about it" pattern; the info block
                    below used to come first, pushing the actual photo past
                    the title/rating/producer text on a phone. Desktop keeps
                    its original side-by-side order (lg:order-1) since that
                    layout doesn't have this stacking problem. */}
                <div className="order-1 min-w-0 lg:order-1 lg:row-span-2">
                  <div className="group/photo relative flex h-full min-h-[310px] flex-col overflow-hidden rounded-[22px] border border-white bg-white shadow-[0_18px_48px_rgba(15,23,42,0.09)] ring-1 ring-slate-200/70 sm:min-h-[410px] sm:rounded-[26px] lg:min-h-[520px]">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(224,242,254,0.78),transparent_48%),linear-gradient(155deg,rgba(255,255,255,0)_55%,rgba(20,184,166,0.07))]" />
                    <span className="pointer-events-none absolute -left-1/2 top-0 z-10 h-full w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-1000 ease-out group-hover/photo:translate-x-[520%] motion-reduce:hidden" />
                    <div className="relative flex min-h-[270px] flex-1 items-center justify-center p-3 sm:min-h-[350px] sm:p-6 lg:min-h-[430px]">
                      <ProductImageWithFallback
                        alt={`Фото товару ${product.name}`}
                        width={720}
                        height={720}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        zoomEnabled
                        productCode={product.code || resolvedCode}
                        articleHint={product.article}
                        hasKnownPhoto={productHasKnownPhoto}
                        preferCachedPreview
                        unoptimized
                        syncWithProductGallery
                        className={heroProductImageClass}
                      />
                    </div>
                    <ProductGallery
                      code={product.code || resolvedCode}
                      productName={product.name}
                      initialImages={galleryImageUrls}
                    />
                  </div>
                </div>

                <div className="order-2 min-w-0 lg:order-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-700">
                      Деталь для автомобіля
                    </span>
                    <span className="h-1 w-1 rounded-full bg-slate-300" aria-hidden="true" />
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                        isInStock
                          ? "bg-emerald-50 text-emerald-800"
                          : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      <CircleCheck size={13} aria-hidden="true" />
                      {isInStock ? `В наявності${product.quantity > 0 ? ` · ${product.quantity} шт.` : ""}` : "Під замовлення"}
                    </span>
                  </div>

                  <div className="relative mt-3 border-l-[3px] border-sky-500 pl-3.5 sm:mt-4 sm:pl-4">
                    <h1
                      style={{ fontStyle: "normal" }}
                      className="font-display max-w-[27ch] break-words text-[clamp(1.65rem,3.2vw,2.8rem)] font-extrabold leading-[1.06] tracking-[-0.042em] text-slate-950 [overflow-wrap:anywhere] [text-wrap:balance]"
                    >
                      {productHeadingText}
                    </h1>
                    <span className="mt-3 block h-1 w-20 rounded-full bg-[linear-gradient(90deg,#0ea5e9,#22d3ee,#14b8a6)]" aria-hidden="true" />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] sm:mt-4 sm:text-[13px]">
                    <a href="#product-reviews" className="inline-flex items-center gap-1.5 rounded-full text-slate-600 transition hover:text-sky-700">
                      <Star size={16} className="fill-amber-400 text-amber-400" aria-hidden="true" />
                      {reviewStats ? (
                        <>
                          <strong className="text-slate-900">{reviewStats.avgRating.toFixed(1)}</strong>
                          <span>· {reviewStats.ratingCount} відгуків</span>
                        </>
                      ) : (
                        <span>Залишити перший відгук</span>
                      )}
                    </a>
                    <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
                    <span className="text-slate-500">
                      {productIdentifierLabel}: <strong className="font-mono text-slate-800">{productIdentifierValue}</strong>
                    </span>
                    {productIdentifierHint ? <span className="text-slate-500">{productIdentifierHint}</span> : null}
                  </div>

                  <div className="mt-4 grid overflow-hidden rounded-[18px] border border-slate-200/80 bg-white/80 shadow-[0_10px_30px_rgba(15,23,42,0.05)] sm:grid-cols-2">
                    {product.producer ? (
                      <div className="flex min-h-[72px] items-center gap-3 border-b border-slate-200/80 px-3.5 py-3 sm:border-b-0 sm:border-r">
                        {producerLogoPath ? (
                          <div className="grid h-11 w-16 shrink-0 place-items-center rounded-xl border border-slate-100 bg-white p-1.5 shadow-sm">
                            <Image
                              src={producerLogoPath}
                              alt={`Логотип виробника ${product.producer}`}
                              width={64}
                              height={36}
                              className="h-8 w-full object-contain"
                              loading="lazy"
                            />
                          </div>
                        ) : (
                          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700">
                            <BadgeCheck size={21} aria-hidden="true" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Виробник</p>
                          {producerLandingPath ? (
                            <Link href={producerLandingPath} className="mt-1 block truncate text-[13px] font-extrabold text-slate-900 transition hover:text-sky-700">{product.producer}</Link>
                          ) : (
                            <p className="mt-1 truncate text-[13px] font-extrabold text-slate-900">{product.producer}</p>
                          )}
                        </div>
                      </div>
                    ) : null}
                    {visibleProductSubgroup || visibleProductGroup ? (
                      <div className={`flex min-h-[72px] items-center gap-3 px-3.5 py-3 ${!product.producer ? "sm:col-span-2" : ""}`}>
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                          <PackageSearch size={21} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Категорія</p>
                          <Link href={categoryLandingHref} className="mt-1 block truncate text-[13px] font-extrabold text-slate-900 transition hover:text-sky-700">
                            {visibleProductSubgroup || visibleProductGroup}
                          </Link>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="order-3 min-w-0 lg:order-3">
                  <ProductPurchasePanelClient
                    lookupKeys={lookupKeys}
                    isModalView={isModalView}
                    initialPriceUah={initialPriceUah}
                    initialCostPriceUah={initialCostPriceUah}
                    hasKnownNoPrice={product.priceEuro === null}
                    resolvedCode={resolvedCode}
                    product={product}
                    isInStock={isInStock}
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[15px] border border-white bg-white/65 px-3.5 py-3 text-[10px] font-bold text-slate-600 shadow-[0_8px_20px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/60">
                    {productHeroHighlights.map(({ label, icon: HighlightIcon }) => (
                      <span key={label} className="inline-flex items-center gap-1.5">
                        <HighlightIcon size={14} className="text-sky-700" aria-hidden="true" />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </header>

          <ProductPageAdminEditGate
            code={product.code || resolvedCode}
            article={product.article || ""}
            name={product.name || ""}
            producer={product.producer || ""}
            priceEuro={product.priceEuro ?? null}
            costPriceEuro={product.costPriceEuro ?? null}
            group={product.group || ""}
            subGroup={product.subGroup || ""}
            category={product.category || ""}
            quantity={product.quantity ?? 0}
            description={product.description || ""}
          />

          {!isModalView ? (
            <nav aria-label="Розділи сторінки товару" className="border-b border-slate-200/80 bg-white px-3 py-2.5 sm:px-5 lg:px-7">
              <div className="mx-auto flex max-w-[1280px] items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {[
                  { href: "#product-description", label: "Опис і характеристики" },
                  { href: "#product-alternatives", label: "Аналоги" },
                  { href: "#product-reviews", label: "Відгуки" },
                ].map((item, index) => (
                  <a
                    key={item.href}
                    href={item.href}
                    className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[11px] font-extrabold transition sm:px-3.5 sm:text-[12px] ${index === 0 ? "bg-slate-950 text-white shadow-[0_8px_18px_rgba(15,23,42,0.16)]" : "border border-slate-200 bg-slate-50 text-slate-600 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-700"}`}
                  >
                    {item.label}
                    <ChevronRight size={13} aria-hidden="true" />
                  </a>
                ))}
              </div>
            </nav>
          ) : null}

          <div className={contentGridClass}>
            <section id="product-description" className="scroll-mt-24 space-y-3">
              <div className="grid gap-2.5">
                <ProductDescriptionClientCard
                  initialText={product.description || null}
                  lookupKeys={lookupKeys}
                  isModalView={isModalView}
                  descriptionTextClass={descriptionTextClass}
                  enableClientLookup
                  fitmentText={productFitmentText}
                  contactPhone={STORE_PHONE_DISPLAY}
                  contactAddress={STORE_ADDRESS}
                  chatButton={
                    <OpenChatButton
                      message={chatPrefillMessage}
                      title="Відкрити чат з менеджером"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] border border-sky-200 bg-white text-sky-700 shadow-[0_10px_20px_rgba(14,165,233,0.12)] transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50"
                    />
                  }
                />
              </div>

              {!isModalView && (
                <ProductFaqSection
                  name={visibleProductName}
                  producer={product.producer}
                  group={productGroup}
                  subGroup={productSubgroup}
                  hasPrice={initialPriceUah != null}
                  quantity={product.quantity}
                />
              )}

              {!isModalView && (
                <div id="product-alternatives" className="scroll-mt-24 space-y-3">
                  <Suspense fallback={<ProductRelatedItemsFallback />}>
                    <ProductRelatedItemsSection
                      product={{
                        code: product.code,
                        article: product.article,
                        name: product.name,
                        producer: product.producer,
                        group: product.group,
                        subGroup: product.subGroup,
                        category: product.category,
                      }}
                      euroRate={recommendationEuroRate}
                    />
                  </Suspense>
                  <ProductDeferredRecommendations
                    product={{
                      code: product.code,
                      article: product.article,
                      name: product.name,
                      producer: product.producer,
                      quantity: product.quantity,
                      priceEuro: product.priceEuro,
                      group: product.group,
                      subGroup: product.subGroup,
                      category: product.category,
                      hasPhoto: product.hasPhoto,
                    }}
                    euroRate={recommendationEuroRate}
                  />
                </div>
              )}
            </section>
          </div>

          {!isModalView && resolvedCode && (
            <div id="product-reviews" className="scroll-mt-24">
              <ProductReviewsSection
                productCode={resolvedCode}
                initialReviews={initialReviews}
              />
            </div>
          )}

        </article>
      </div>

      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(itemPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }}
        />
      )}
    </div>
  );
}
