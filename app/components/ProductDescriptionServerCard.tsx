import "server-only";

import type { ComponentProps } from "react";

import ProductDescriptionClientCard from "app/components/ProductDescriptionClientCard";
import {
  lookupProductDescription,
  lookupProductDescriptionForProduct,
  type ProductDescriptionLookupResult,
} from "app/lib/catalog-server";
import { resolveWithTimeout } from "app/lib/resolve-with-timeout";

// 1C description lookups measure 1.9-3.7s live (see /api/product-description);
// the per-key budget matches that route, the outer one caps how long this
// Suspense boundary can hold the streamed HTML.
const DESCRIPTION_LOOKUP_TIMEOUT_MS = 4000;
const DESCRIPTION_SSR_TIMEOUT_MS = 4500;
const DESCRIPTION_LOOKUP_LIMIT = 4;

type ProductDescriptionServerCardProps = ComponentProps<typeof ProductDescriptionClientCard> & {
  // Lookup the page started as soon as it knew the product (see
  // startProductDescriptionLookup) — by the time this Suspense boundary
  // renders it has usually finished, instead of only now joining the queue
  // for 1C's allgoods slots behind the page's analog/similar-item queries.
  descriptionLookup?: Promise<ProductDescriptionLookupResult> | null;
};

const DESCRIPTION_LOOKUP_OPTIONS = {
  timeoutMs: DESCRIPTION_LOOKUP_TIMEOUT_MS,
  retries: 0,
  retryDelayMs: 150,
  cacheTtlMs: 1000 * 60 * 5,
};

export const startProductDescriptionLookup = (code: string, article: string) =>
  lookupProductDescriptionForProduct(code, article, DESCRIPTION_LOOKUP_OPTIONS).catch(
    (): ProductDescriptionLookupResult => ({ description: null, answered: false })
  );

// Most products have no description in the catalog snapshot — it lives behind
// a separate 1C call that the client card used to make only after hydration,
// so the server HTML (what crawlers index) carried a loading skeleton instead
// of the text. Resolving it here puts the description into the initial HTML;
// the client card still revalidates against live 1C after hydration.
export default async function ProductDescriptionServerCard({
  descriptionLookup,
  ...props
}: ProductDescriptionServerCardProps) {
  const initialText = props.initialText?.trim() || null;
  if (initialText || props.isModalView) {
    return <ProductDescriptionClientCard {...props} initialText={initialText} />;
  }

  const lookupKeys = Array.from(
    new Set(props.lookupKeys.map((key) => (key || "").trim()).filter(Boolean))
  ).slice(0, DESCRIPTION_LOOKUP_LIMIT);

  // undefined = timed out or 1C unreachable (unknown), null = 1C answered
  // with no description.
  const description = await resolveWithTimeout<string | null | undefined>(
    async () => {
      const results = descriptionLookup
        ? [await descriptionLookup]
        : await Promise.all(
            lookupKeys.map((key) =>
              lookupProductDescription(key, DESCRIPTION_LOOKUP_OPTIONS).catch(
                (): ProductDescriptionLookupResult => ({ description: null, answered: false })
              )
            )
          );
      const found = results.find((result) => Boolean(result.description?.trim()));
      if (found?.description) return found.description.trim();
      return results.some((result) => result.answered) ? null : undefined;
    },
    undefined,
    DESCRIPTION_SSR_TIMEOUT_MS
  );

  return (
    <ProductDescriptionClientCard
      {...props}
      initialText={description ?? null}
      // A completed lookup with no result means there is no description, so
      // render the "уточнюється" note instead of a loading skeleton. A
      // timeout keeps the skeleton and lets the client retry.
      serverChecked={description === null}
    />
  );
}
