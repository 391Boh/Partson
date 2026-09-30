import "server-only";
import type { NextRequest } from "next/server";

import { getFirebaseAdminAuth, getFirebaseAdminDb } from "app/lib/firebase-admin";

const ENV_ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

export type AdminIdentity = { uid: string; email: string };

// Mirrors partnerStatusCache in partner-auth.ts: an admin whose role comes
// from the Firestore users/{uid} doc (not the env allowlist) used to pay a
// Firestore round trip on *every* admin-mode request — and a catalog page
// viewed as admin calls this on every price batch (see includeCostPrices in
// Data.tsx), so that was a real, repeated tax on top of everything else
// before the promo price could render. The env-allowlist path already never
// touched Firestore at all, so this only helps the Firestore-role admins.
const ADMIN_ROLE_CACHE_TTL_MS = 1000 * 60 * 2;
const ADMIN_ROLE_CACHE_MAX_ENTRIES = 1000;
const adminRoleCache = new Map<string, { isAdmin: boolean; expiresAt: number }>();

// Two ways to be recognized as admin here:
// 1. Listed in NEXT_PUBLIC_ADMIN_EMAILS — the original deploy-time bootstrap
//    list. Always kept working so the site can never lock itself out of its
//    own admin panel even if the Firestore role data is empty or broken.
// 2. role: "admin" on the user's Firestore users/{uid} doc — assignable at
//    runtime from the admin panel's Users tab (app/api/admin/users), no
//    redeploy needed.
// The email list is checked first since it never needs a Firestore round-trip.
export const verifyAdminRequest = async (
  request: NextRequest
): Promise<AdminIdentity | null> => {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return null;

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token);
    const uid = decoded.uid;
    const email = (decoded.email || "").toLowerCase();
    if (!uid) return null;

    if (email && ENV_ADMIN_EMAILS.has(email)) return { uid, email };

    const now = Date.now();
    const cached = adminRoleCache.get(uid);
    if (cached && cached.expiresAt > now) {
      return cached.isAdmin ? { uid, email } : null;
    }

    const userDoc = await getFirebaseAdminDb().collection("users").doc(uid).get();
    const role = userDoc.exists ? (userDoc.data()?.role as string | undefined) : undefined;
    const isAdmin = role === "admin";

    if (adminRoleCache.size >= ADMIN_ROLE_CACHE_MAX_ENTRIES) {
      const oldestKey = adminRoleCache.keys().next().value as string | undefined;
      if (oldestKey) adminRoleCache.delete(oldestKey);
    }
    adminRoleCache.set(uid, { isAdmin, expiresAt: now + ADMIN_ROLE_CACHE_TTL_MS });

    return isAdmin ? { uid, email } : null;
  } catch {
    return null;
  }
};
