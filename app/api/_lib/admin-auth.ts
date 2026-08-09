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

    const userDoc = await getFirebaseAdminDb().collection("users").doc(uid).get();
    const role = userDoc.exists ? (userDoc.data()?.role as string | undefined) : undefined;
    if (role === "admin") return { uid, email };

    return null;
  } catch {
    return null;
  }
};
