import "server-only";

import { getFirebaseAdminDb } from "app/lib/firebase-admin";

// Which products have anything in Firestore that the product page renders:
// reviews (productReviews/{code} with ratingCount ≥ 1) or extra gallery photos
// (productGallery/{code}/images/*). Most products have neither, yet every
// server render of the product page used to wait on both per-product reads
// (~0.7 s measured) just to learn that — before sending its first byte.
// One cheap ids-only scan every few minutes answers it for the whole catalog,
// so the page can skip those reads for everything not listed here.
//
// Staleness is bounded by PRESENCE_TTL_MS: a review or photo added moments ago
// may be missing from a page rendered inside that window (the review list and
// gallery strip also load client-side, so it only affects the server HTML and
// JSON-LD of that render). null until the first scan has completed — callers
// must then fall back to the per-product reads.
type ProductFirestorePresence = {
  reviews: Set<string>;
  gallery: Set<string>;
  loadedAt: number;
};

const PRESENCE_TTL_MS = 1000 * 60 * 3;

let presence: ProductFirestorePresence | null = null;
let presenceInFlight: Promise<ProductFirestorePresence> | null = null;

const scanPresence = async (): Promise<ProductFirestorePresence> => {
  const db = getFirebaseAdminDb();
  const [reviewSnap, gallerySnap] = await Promise.all([
    db.collection("productReviews").select("ratingCount").get(),
    db.collectionGroup("images").select().get(),
  ]);

  const reviews = new Set<string>();
  for (const doc of reviewSnap.docs) {
    const ratingCount = doc.get("ratingCount");
    if (typeof ratingCount === "number" && ratingCount >= 1) reviews.add(doc.id);
  }

  const gallery = new Set<string>();
  for (const doc of gallerySnap.docs) {
    // collectionGroup("images") also matches any other "images" subcollection.
    const productDoc = doc.ref.parent.parent;
    if (productDoc && productDoc.parent.id === "productGallery") gallery.add(productDoc.id);
  }

  return { reviews, gallery, loadedAt: Date.now() };
};

const refreshPresence = () => {
  presenceInFlight ??= scanPresence()
    .then((next) => {
      presence = next;
      return next;
    })
    .finally(() => {
      presenceInFlight = null;
    });
  return presenceInFlight;
};

// Never blocks: returns the last scan (refreshing it in the background once
// it is older than the TTL), or null before the first scan completes.
export const getProductFirestorePresence = (): ProductFirestorePresence | null => {
  if (!presence || Date.now() - presence.loadedAt > PRESENCE_TTL_MS) {
    void refreshPresence().catch(() => undefined);
  }
  return presence;
};

// Called right after a successful write (new review, uploaded gallery photo)
// so the next render of that product doesn't skip it while waiting for the
// next scan.
export const markProductFirestorePresence = (kind: "reviews" | "gallery", code: string) => {
  const normalized = (code || "").trim();
  if (normalized && presence) presence[kind].add(normalized);
};
