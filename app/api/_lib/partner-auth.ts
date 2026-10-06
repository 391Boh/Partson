import "server-only";

import { PARTNER_THRESHOLD_UAH } from "app/lib/partnership-discount";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";

export type PartnerIdentity = {
  uid: string;
  email: string;
  totalSpent: number;
};

const PARTNER_STATUS_CACHE_TTL_MS = 1000 * 60 * 2;
const PARTNER_STATUS_CACHE_MAX_ENTRIES = 1000;
type PartnerStatusCacheEntry = { isPartner: boolean; totalSpent: number; expiresAt: number };
declare global {
  var __partsonPartnerStatusCache: Map<string, PartnerStatusCacheEntry> | undefined;
}
const partnerStatusCache = globalThis.__partsonPartnerStatusCache ??= new Map<string, PartnerStatusCacheEntry>();

export const invalidatePartnerStatus = (uid: string) => {
  partnerStatusCache.delete(uid.trim());
};

const readOrderAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const resolvePartnerStatusByUid = async (uid: string) => {
  const normalizedUid = uid.trim();
  if (!normalizedUid) return { isPartner: false, totalSpent: 0 };

  // Both signals (manual grant + spend threshold) must come from this one
  // cache check, not just the spend half of it — the manual-grant Firestore
  // read used to run unconditionally, every single call, regardless of the
  // cache below. Every partner-mode price batch on /katalog calls this (via
  // verifyPartnerRequest), so that unconditional read was a genuine Firestore
  // round trip on every one of them — the actual reason the promo price kept
  // lagging behind everything else even after the 1C-side fix.
  const now = Date.now();
  const cached = partnerStatusCache.get(normalizedUid);
  if (cached && cached.expiresAt > now) {
    return { isPartner: cached.isPartner, totalSpent: cached.totalSpent };
  }

  const [grant, snapshot] = await Promise.all([
    getFirebaseAdminDb().collection("partnerGrants").doc(normalizedUid).get(),
    getFirebaseAdminDb().collection("orders").where("uid", "==", normalizedUid).get(),
  ]);
  const manuallyGranted = grant.data()?.active === true;
  const totalSpent = snapshot.docs.reduce((sum, document) => {
    const data = document.data() as { totalAmount?: unknown; total?: unknown };
    return sum + readOrderAmount(data.totalAmount ?? data.total);
  }, 0);
  const status = {
    isPartner: manuallyGranted || totalSpent >= PARTNER_THRESHOLD_UAH,
    totalSpent,
  };

  if (partnerStatusCache.size >= PARTNER_STATUS_CACHE_MAX_ENTRIES) {
    const oldestKey = partnerStatusCache.keys().next().value as string | undefined;
    if (oldestKey) partnerStatusCache.delete(oldestKey);
  }
  partnerStatusCache.set(normalizedUid, {
    ...status,
    expiresAt: now + PARTNER_STATUS_CACHE_TTL_MS,
  });

  return status;
};

export const verifyPartnerRequest = async (
  request: Request
): Promise<PartnerIdentity | null> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    if (!decoded.uid) return null;

    const status = await resolvePartnerStatusByUid(decoded.uid);
    if (!status.isPartner) return null;

    return {
      uid: decoded.uid,
      email: (decoded.email || "").toLowerCase(),
      totalSpent: status.totalSpent,
    };
  } catch {
    return null;
  }
};
