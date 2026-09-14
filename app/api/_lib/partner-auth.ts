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
const partnerStatusCache = new Map<
  string,
  { isPartner: boolean; totalSpent: number; expiresAt: number }
>();

const readOrderAmount = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
};

export const resolvePartnerStatusByUid = async (uid: string) => {
  const normalizedUid = uid.trim();
  if (!normalizedUid) return { isPartner: false, totalSpent: 0 };

  const now = Date.now();
  const cached = partnerStatusCache.get(normalizedUid);
  if (cached && cached.expiresAt > now) {
    return { isPartner: cached.isPartner, totalSpent: cached.totalSpent };
  }

  const snapshot = await getFirebaseAdminDb()
    .collection("orders")
    .where("uid", "==", normalizedUid)
    .get();
  const totalSpent = snapshot.docs.reduce((sum, document) => {
    const data = document.data() as { totalAmount?: unknown; total?: unknown };
    return sum + readOrderAmount(data.totalAmount ?? data.total);
  }, 0);
  const status = {
    isPartner: totalSpent >= PARTNER_THRESHOLD_UAH,
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
