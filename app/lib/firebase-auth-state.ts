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
