"use client";

import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { GOOGLE_REDIRECT_PENDING_KEY } from "app/lib/auth-storage";

type FirebaseAuthSnapshot = {
  ready: boolean;
  user: User | null;
};

type FirebaseAuthDeps = {
  auth: typeof import("../../firebase").auth;
  getRedirectResult: typeof import("firebase/auth").getRedirectResult;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
};

let authDepsPromise: Promise<FirebaseAuthDeps> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let authSubscriptionScheduled = false;

const getInitialClientSnapshot = (): FirebaseAuthSnapshot => {
  if (typeof window === "undefined") return { ready: false, user: null };
  try {
    const uid = localStorage.getItem("user_id");
    const hasPendingGoogleRedirect =
      sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1";
    if (!uid && !hasPendingGoogleRedirect) return { ready: true, user: null };
  } catch {}
  return { ready: false, user: null };
};

let snapshot: FirebaseAuthSnapshot = getInitialClientSnapshot();
const serverSnapshot: FirebaseAuthSnapshot = {
  ready: false,
  user: null,
};

const listeners = new Set<(nextSnapshot: FirebaseAuthSnapshot) => void>();

const emitSnapshot = (nextSnapshot: FirebaseAuthSnapshot) => {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener(snapshot));
};

const loadFirebaseAuthDeps = () => {
  authDepsPromise ??= Promise.all([
    import("../../firebase"),
    import("firebase/auth"),
  ]).then(([firebaseModule, authModule]) => ({
    auth: firebaseModule.auth,
    getRedirectResult: authModule.getRedirectResult,
    onAuthStateChanged: authModule.onAuthStateChanged,
  }));

  return authDepsPromise;
};

const ensureFirebaseAuthSubscription = () => {
  if (unsubscribeAuth) return;

  void loadFirebaseAuthDeps()
    .then(async ({ auth, getRedirectResult, onAuthStateChanged }) => {
      let redirectUser: User | null = null;
      let hasPendingGoogleRedirect = false;
      try {
        hasPendingGoogleRedirect =
          sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1";
      } catch {}

      if (hasPendingGoogleRedirect) {
        try {
          redirectUser = (await getRedirectResult(auth))?.user ?? null;
        } catch (error) {
          console.error("Failed to complete Google redirect sign-in:", error);
        } finally {
          try {
            sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
          } catch {}
        }
      }

      emitSnapshot({
        ready: true,
        user: redirectUser ?? auth.currentUser ?? null,
      });

      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        emitSnapshot({
          ready: true,
          user: user ?? null,
        });
      });
    })
    .catch((error) => {
      console.error("Failed to initialize Firebase auth state:", error);
      emitSnapshot({
        ready: true,
        user: null,
      });
    });
};

const scheduleFirebaseAuthSubscription = () => {
  if (unsubscribeAuth || authSubscriptionScheduled) return;
  authSubscriptionScheduled = true;

  if (typeof window === "undefined") {
    ensureFirebaseAuthSubscription();
    return;
  }

  const win = window as Window & {
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  let timeoutId: number | null = null;
  let idleId: number | null = null;

  const start = () => {
    window.removeEventListener("pointerdown", start);
    window.removeEventListener("keydown", start);
    if (timeoutId != null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (idleId != null) {
      win.cancelIdleCallback?.(idleId);
      idleId = null;
    }
    ensureFirebaseAuthSubscription();
  };

  window.addEventListener("pointerdown", start, { once: true, passive: true });
  window.addEventListener("keydown", start, { once: true });

  timeoutId = window.setTimeout(start, 500);
};

const hasPersistedAuthIntent = () => {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(
      localStorage.getItem("user_id") ||
        sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1"
    );
  } catch {
    return false;
  }
};

export const getFirebaseAuthSnapshot = () => snapshot;

// Admin-action call sites (getAdminToken in Data.tsx and friends) used to
// read getFirebaseAuthSnapshot() synchronously. The real Firebase Auth
// subscription is deliberately deferred until the first pointerdown/keydown
// or a 500ms timeout (see scheduleFirebaseAuthSubscription) to keep it off
// the critical path for guests. The bug: clicking an admin "edit" button IS
// that first pointerdown — it kicks off the deferred subscription AND, in
// the same synchronous handler, immediately reads the still-stale snapshot
// before the async Firebase load has resolved. A genuinely logged-in admin
// clicking edit as their first interaction on the page would see "Не
// авторизовано" even though they're authenticated, because the check ran
// before the subscription had a chance to confirm it. This waits for the
// subscription to actually resolve (kicking it off immediately, not
// deferred) instead of trusting whatever snapshot happens to exist yet.
export const waitForFirebaseAuthReady = (): Promise<FirebaseAuthSnapshot> => {
  ensureFirebaseAuthSubscription();
  if (snapshot.ready) return Promise.resolve(snapshot);
  return new Promise((resolve) => {
    const listener = (next: FirebaseAuthSnapshot) => {
      if (!next.ready) return;
      listeners.delete(listener);
      resolve(next);
    };
    listeners.add(listener);
  });
};

export const publishFirebaseAuthUser = (user: User | null) => {
  try {
    sessionStorage.removeItem(GOOGLE_REDIRECT_PENDING_KEY);
  } catch {}
  emitSnapshot({ ready: true, user });
  ensureFirebaseAuthSubscription();
};

export const subscribeToFirebaseAuthState = (
  listener: (nextSnapshot: FirebaseAuthSnapshot) => void
) => {
  listeners.add(listener);
  listener(snapshot);

  // Don't pre-load Firebase for guests (no user_id in localStorage → snapshot is ready+null).
  // Only schedule when user might be logged in (snapshot not yet resolved, or user is set).
  if (!snapshot.ready && !hasPersistedAuthIntent()) {
    emitSnapshot({ ready: true, user: null });
  } else if (!snapshot.ready || snapshot.user !== null) {
    scheduleFirebaseAuthSubscription();
  }

  return () => {
    listeners.delete(listener);
  };
};

export const useFirebaseAuthState = () => {
  return useSyncExternalStore(
    subscribeToFirebaseAuthState,
    getFirebaseAuthSnapshot,
    () => serverSnapshot
  );
};
