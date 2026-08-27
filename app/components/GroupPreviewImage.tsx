"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import { buildProductImagePath } from "app/lib/product-image-path";
import { PRODUCT_IMAGE_BATCH_MAX_ITEMS } from "app/lib/product-image-constants";
import groupPreviewManifest from "app/generated/group-preview-manifest";

// Shared by the homepage's category→group browser (tovar.tsx) and the car
// model directory page (app/auto/[brand]/[model]/page.tsx) — a representative
// product photo for a (category, group) pair is the same regardless of which
// page or which car it's being shown for, so both consumers hit the same
// module-level caches and the same build-time manifest instead of each
// re-deriving/re-fetching it independently.
const groupPreviewCache = new Map<string, string | null>();
const groupPreviewRequests = new Map<string, Promise<string | null>>();
const groupPreviewVerifyRequests = new Map<string, Promise<string | null>>();
const rejectedDirectGroupPreviews = new Set<string>();
type GroupPreviewCandidate = {
  code?: string;
  article?: string;
  hasPhoto?: boolean;
  hasPrice?: boolean;
  priceEuro?: number | null;
};
const candidateHasKnownPrice = (item: GroupPreviewCandidate) =>
  item.hasPrice === true ||
  (typeof item.priceEuro === "number" && Number.isFinite(item.priceEuro) && item.priceEuro > 0);
const GROUP_PREVIEW_STORAGE_PREFIX = "catalog-group-preview:v1:";
// One catalog-page fetch (limit 12) always fits under the batch endpoint's
// max, so every candidate can be verified in a single round-trip instead of
// several sequential chunked requests.
const GROUP_PREVIEW_BATCH_MAX = PRODUCT_IMAGE_BATCH_MAX_ITEMS;
// Bounds how many catalog-page round-trips loadGroupPreview will make while
// hunting for a photographed product in a group that isn't in the static
// manifest, so a group with no photo at all fails fast instead of paging
// through its entire catalog.
const MAX_GROUP_PREVIEW_PAGES = 2;

const findPreviewInCandidates = async (items: GroupPreviewCandidate[]) => {
  if (items.length === 0) return null;

  // Photos declared by 1C are the most reliable signal, checked first.
  // Among the rest, a product that has a price tends to be an actively
  // maintained/sellable listing and is more likely to have a real photo too,
  // so it's worth checking before priceless ones within the same batch.
  const ordered = [
    ...items.filter((item) => item.hasPhoto === true),
    ...items.filter((item) => item.hasPhoto !== true && candidateHasKnownPrice(item)),
    ...items.filter((item) => item.hasPhoto !== true && !candidateHasKnownPrice(item)),
  ].slice(0, GROUP_PREVIEW_BATCH_MAX);

  const candidates = ordered.map((item) => ({
    code: item.code?.trim() || "",
    article: item.article?.trim() || undefined,
    // Some 1C records have a real photo but omit the flag. The image route
    // requires an explicit value, so every candidate is checked.
    hasPhoto: true,
  }));

  const response = await fetch("/api/catalog-image-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: candidates, deep: false }),
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as {
    items?: Array<{ status?: string; src?: string }>;
  };
  return payload.items?.find((item) => item.status === "ready" && item.src)?.src ?? null;
};

export const loadGroupPreview = (category: string, group: string) => {
  const key = `${category.trim().toLowerCase()}::${group.trim().toLowerCase()}`;
  if (groupPreviewCache.has(key)) return Promise.resolve(groupPreviewCache.get(key) ?? null);
  const generatedSrc = groupPreviewManifest[key];
  if (generatedSrc) {
    groupPreviewCache.set(key, generatedSrc);
    return Promise.resolve(generatedSrc);
  }
  if (typeof window !== "undefined") {
    try {
      const storedSrc = window.sessionStorage.getItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${key}`);
      if (storedSrc) {
        groupPreviewCache.set(key, storedSrc);
        return Promise.resolve(storedSrc);
      }
    } catch {
      // Storage can be unavailable in strict privacy mode; memory cache still works.
    }
  }
  const pending = groupPreviewRequests.get(key);
  if (pending) return pending;

  const request = (async () => {
    let page = 1;
    let cursor = "";
    let cursorField = "";
    const checkedCodes = new Set<string>();

    while (true) {
      // Groups with no photographed product at all would otherwise page
      // through their entire catalog (hundreds of round-trips) before giving
      // up. Capping how far this hunts bounds the worst case to a couple of
      // requests; a group that still hasn't shown a photo by then almost
      // certainly doesn't have one.
      if (page > MAX_GROUP_PREVIEW_PAGES) return null;

      const response = await fetch("/api/catalog-page", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          // Matches GROUP_PREVIEW_BATCH_MAX so a single page, in the common
          // case, already supplies enough candidates for one verification
          // round-trip instead of needing a second page fetch.
          limit: GROUP_PREVIEW_BATCH_MAX,
          cursor,
          cursorField,
          group: category,
          subcategory: group,
          expandHierarchy: true,
          sortOrder: "none",
        }),
      });
      if (!response.ok) return null;

      const payload = (await response.json()) as {
        items?: GroupPreviewCandidate[];
        hasMore?: boolean;
        nextCursor?: string;
        cursorField?: string;
      };
      const freshItems = (payload.items ?? []).filter((item) => {
        const code = item.code?.trim().toLowerCase() || "";
        if (!code || checkedCodes.has(code)) return false;
        checkedCodes.add(code);
        return true;
      });

      // When several items declare a photo, one that also has a price is a
      // more reliably real/maintained listing — prefer it over an arbitrary
      // first match.
      const declaredPhotoCandidates = freshItems.filter(
        (item) => item.hasPhoto === true && item.code?.trim()
      );
      const declaredPhoto =
        declaredPhotoCandidates.find(candidateHasKnownPrice) ?? declaredPhotoCandidates[0];
      if (declaredPhoto?.code && !rejectedDirectGroupPreviews.has(key)) {
        // The catalog already tells us this product has a photo, so its
        // stable route is returned immediately instead of waiting for a
        // verification round-trip. The 1C flag is occasionally wrong though,
        // so verification still runs in the background — if the optimistic
        // image 404s, the <img onError> handler below can recover from this
        // already-in-flight result instead of re-fetching this page from
        // scratch.
        if (!groupPreviewVerifyRequests.has(key)) {
          const verification = findPreviewInCandidates(freshItems).finally(() => {
            groupPreviewVerifyRequests.delete(key);
          });
          groupPreviewVerifyRequests.set(key, verification);
        }
        return buildProductImagePath(declaredPhoto.code, declaredPhoto.article, {
          catalog: true,
          noFallback: true,
        });
      }

      const src = await findPreviewInCandidates(freshItems);
      if (src) return src;
      if (!payload.hasMore || freshItems.length === 0) return null;

      const nextCursor = payload.nextCursor?.trim() || "";
      if (nextCursor && nextCursor === cursor) return null;
      cursor = nextCursor;
      cursorField = payload.cursorField?.trim() || cursorField;
      page += 1;
    }
  })()
    .catch(() => null)
    .then((src) => {
      groupPreviewCache.set(key, src);
      if (src && typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${key}`, src);
        } catch {
          // Keep the in-memory result when browser storage is unavailable.
        }
      }
      groupPreviewRequests.delete(key);
      return src;
    });

  groupPreviewRequests.set(key, request);
  return request;
};

const GroupPreviewImage = React.memo(({ category, group }: { category: string; group: string }) => {
  const cacheKey = `${category.trim().toLowerCase()}::${group.trim().toLowerCase()}`;
  const [src, setSrc] = useState<string | null | undefined>(() =>
    groupPreviewCache.get(cacheKey) ?? groupPreviewManifest[cacheKey]
  );

  useEffect(() => {
    let active = true;
    void loadGroupPreview(category, group).then((nextSrc) => {
      if (active) setSrc(nextSrc);
    });
    return () => { active = false; };
  }, [category, group]);

  if (src === null) return null;

  if (src === undefined) {
    return (
      <span className="relative block h-[88px] w-full overflow-hidden border-b border-sky-100 bg-[linear-gradient(110deg,#f8fcff_20%,#e5f6ff_42%,#f4fbff_64%)] bg-[length:220%_100%] motion-safe:animate-pulse sm:h-[104px]" aria-hidden="true" />
    );
  }

  return (
    <span className="relative block h-[88px] w-full overflow-hidden border-b border-sky-100/90 bg-[radial-gradient(circle_at_72%_12%,rgba(125,211,252,0.28),transparent_43%),linear-gradient(145deg,#ffffff_0%,#f5fbff_55%,#eaf8ff_100%)] shadow-[inset_0_2px_6px_rgba(15,23,42,0.08),inset_0_-4px_12px_rgba(2,132,199,0.10),inset_0_0_0_1px_rgba(15,23,42,0.03)] transition-shadow duration-500 ease-out group-hover/category:shadow-[inset_0_3px_10px_rgba(15,23,42,0.16),inset_0_-8px_20px_rgba(2,132,199,0.22),inset_0_0_0_1px_rgba(2,132,199,0.08)] sm:h-[104px]">
      <Image
        src={src}
        alt={`Автозапчастини групи «${group}» у категорії «${category}»`}
        fill
        unoptimized
        loading="eager"
        fetchPriority="high"
        sizes="(min-width: 1280px) 280px, (min-width: 640px) 23vw, 46vw"
        className="object-contain p-2.5 transition-[filter,opacity,transform] duration-500 ease-out group-hover/category:scale-[1.08] group-hover/category:brightness-[1.04] group-hover/category:saturate-[1.1] sm:p-3"
        onError={() => {
          rejectedDirectGroupPreviews.add(cacheKey);
          groupPreviewCache.delete(cacheKey);
          try {
            window.sessionStorage.removeItem(`${GROUP_PREVIEW_STORAGE_PREFIX}${cacheKey}`);
          } catch {
            // Continue with memory-only fallback in restricted storage mode.
          }
          setSrc(undefined);
          const pendingVerification = groupPreviewVerifyRequests.get(cacheKey);
          groupPreviewVerifyRequests.delete(cacheKey);
          const recovery = pendingVerification
            ? pendingVerification.then((verifiedSrc) => {
                if (verifiedSrc) {
                  groupPreviewCache.set(cacheKey, verifiedSrc);
                  return verifiedSrc;
                }
                return loadGroupPreview(category, group);
              })
            : loadGroupPreview(category, group);
          void recovery.then(setSrc);
        }}
      />
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-sky-900/5 via-transparent to-white/20" />
    </span>
  );
});
GroupPreviewImage.displayName = "GroupPreviewImage";

export default GroupPreviewImage;
