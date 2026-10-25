import { getFirebaseAuthSnapshot, waitForFirebaseAuthReady } from './firebase-auth-state';

export type PrivateProductPrice = {
  isPartner?: boolean;
  promoPriceUah?: number | null;
  promoPriceEuro?: number | null;
};

// Share the admin editor/purchase panel's simultaneous authorized read.
// Private values stay in memory, scoped to the verified Firebase user.
const reads = new Map<string, { expires: number; promise: Promise<PrivateProductPrice | null> }>();
const REUSE_MS = 2000;

export async function loadPrivateProductPrice(keys: readonly string[], force = false): Promise<PrivateProductPrice | null> {
  const lookups = [...new Set(keys.map(key => key.trim()).filter(Boolean))];
  if (!lookups.length) return null;
  const { user } = await waitForFirebaseAuthReady();
  if (!user) { reads.clear(); return null; }
  const cacheKey = `${user.uid}:${JSON.stringify([...lookups].sort())}`;
  const cached = reads.get(cacheKey);
  if (!force && cached && cached.expires > Date.now()) return cached.promise;
  // Bound memory while navigating through many products.
  for (const [key, entry] of reads) if (entry.expires <= Date.now()) reads.delete(key);
  const entry = { expires: Number.POSITIVE_INFINITY, promise: Promise.resolve<PrivateProductPrice | null>(null) };
  entry.promise = (async () => {
    try {
      const token = await user.getIdToken();
      if (getFirebaseAuthSnapshot().user?.uid !== user.uid) return null;
      const params = new URLSearchParams({ mode: 'partner' });
      lookups.forEach(key => params.append('lookup', key));
      const response = await fetch(`/api/product-price?${params}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok || getFirebaseAuthSnapshot().user?.uid !== user.uid) return null;
      const payload = await response.json() as PrivateProductPrice;
      return reads.get(cacheKey) === entry && getFirebaseAuthSnapshot().user?.uid === user.uid ? payload : null;
    } catch {
      return null;
    } finally {
      entry.expires = Date.now() + REUSE_MS;
    }
  })();
  reads.set(cacheKey, entry);
  return entry.promise;
}
