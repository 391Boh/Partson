"use client";

import type { User } from "firebase/auth";
import { waitForFirebaseAuthReady } from "app/lib/firebase-auth-state";

// Shared by every admin-only client component that needs to call an
// authenticated API route (product edits, chat replies, order status,
// broadcasts, …) — was independently copy-pasted in half a dozen places.
export async function getCurrentAdminUser(): Promise<User | null> {
  const snapshot = await waitForFirebaseAuthReady();
  return snapshot.user;
}

export async function getAdminIdToken(): Promise<string | null> {
  const user = await getCurrentAdminUser();
  if (!user) return null;
  return user.getIdToken().catch(() => null);
}
