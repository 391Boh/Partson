import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";

// Which products have anything in Firestore that the product page renders:
// reviews (productReviews/{code} with ratingCount ≥ 1) or extra gallery photos
// (productGallery/{code}/images/*). Most products have neither, yet every
// server render of the product page used to wait on both per-product reads
// (~0.7 s measured) just to learn that — before sending its first byte.
// One ids-only scan answers it for the whole catalog, so the page can skip
// those reads for everything not listed here.
//
// Firestore cost (27.11.2026): every scan reads each productReviews doc and
// each gallery image (~1.3k docs). With a 3-minute in-memory TTL, crawlers
// rendering product pages around the clock and pages/route handlers each
// holding their own module copy, the scan ran ~480+ times a day: ~620k reads
// against the 50k/day no-cost quota. Now the scan result lives in Next's
// shared data cache (one entry for the whole server, on disk, surviving
// restarts) and is refreshed every 6 h, or right away when the site itself
// writes a review or gallery photo (refreshProductFirestorePresence) —
// about 4–10 scans a day, ~5–13k reads.
//
// The in-memory copy only avoids awaiting the data cache on every render;
// it re-reads the shared entry (no Firestore cost unless it is stale) every
// few minutes. null until the first load has completed — callers must then
// fall back to the per-product reads.
type ProductFirestorePresence = {
  reviews: Set<string>;
  gallery: Set<string>;
  loadedAt: number;
};

const PRESENCE_TAG = "product-firestore-presence";
const PRESENCE_REVALIDATE_SECONDS = 60 * 60 * 6;
const MEMORY_TTL_MS = 1000 * 60 * 5;

const scanPresence = async () => {
  const db = getFirebaseAdminDb();
  const [reviewSnap, gallerySnap] = await Promise.all([
    db.collection("productReviews").select("ratingCount").get(),
    db.collectionGroup("images").select().get(),
  ]);

  const reviews: string[] = [];
  for (const doc of reviewSnap.docs) {
    const ratingCount = doc.get("ratingCount");
    if (typeof ratingCount === "number" && ratingCount >= 1) reviews.push(doc.id);
  }

  const gallery = new Set<string>();
  for (const doc of gallerySnap.docs) {
    // collectionGroup("images") also matches any other "images" subcollection.
    const productDoc = doc.ref.parent.parent;
    if (productDoc && productDoc.parent.id === "productGallery") gallery.add(productDoc.id);
  }

  return { reviews, gallery: Array.from(gallery), scannedAt: Date.now() };
};

// Failed scans throw and are not stored, so the next call retries.
const loadSharedPresence = unstable_cache(scanPresence, ["product-firestore-presence-v2"], {
  revalidate: PRESENCE_REVALIDATE_SECONDS,
  tags: [PRESENCE_TAG],
});

let presence: ProductFirestorePresence | null = null;
let presenceInFlight: Promise<ProductFirestorePresence> | null = null;

const refreshPresence = () => {
  presenceInFlight ??= loadSharedPresence()
    .then((shared) => {
      const next: ProductFirestorePresence = {
        reviews: new Set(shared.reviews),
        gallery: new Set(shared.gallery),
        loadedAt: Date.now(),
      };
      // Keep codes this process marked after a write until the shared entry
      // has caught up with them.
      if (presence) {
        for (const code of presence.reviews) next.reviews.add(code);
        for (const code of presence.gallery) next.gallery.add(code);
      }
      presence = next;
      return next;
    })
    .finally(() => {
      presenceInFlight = null;
    });
  return presenceInFlight;
};

// Never blocks: returns the last known presence (refreshing it from the
// shared cache in the background once it is older than MEMORY_TTL_MS), or
// null before the first load completes.
export const getProductFirestorePresence = (): ProductFirestorePresence | null => {
  if (!presence || Date.now() - presence.loadedAt > MEMORY_TTL_MS) {
    void refreshPresence().catch(() => undefined);
  }
  return presence;
};

// Called right after a successful write (new review, uploaded gallery photo):
// this process sees it at once, and the shared entry is marked stale so the
// product pages (a separate module copy in production) pick it up on their
// next refresh instead of up to 6 h later.
export const markProductFirestorePresence = (kind: "reviews" | "gallery", code: string) => {
  const normalized = (code || "").trim();
  if (!normalized) return;
  if (presence) presence[kind].add(normalized);
  try {
    revalidateTag(PRESENCE_TAG, { expire: 0 });
  } catch {
    // Outside a request scope (scripts): the 6-hour refresh still applies.
  }
};
