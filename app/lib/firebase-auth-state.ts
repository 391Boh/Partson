"use client";

import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";
import { GOOGLE_REDIRECT_PENDING_KEY } from "app/lib/auth-storage";

type FirebaseAuthSnapshot = {
  ready: boolean;
  user: User | null;
};

type FirebaseAuthDeps = {
  auth: typeof import("./firebase-auth").auth;
  getRedirectResult: typeof import("firebase/auth").getRedirectResult;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
};

let authDepsPromise: Promise<FirebaseAuthDeps> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let authInitialization: Promise<void> | null = null;
// `ready: true, user: null` can be a cheap guest hint. Protected actions
// must still wait for Firebase itself to confirm or restore that session.
let hasConfirmedAuthState = false;

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

const emitSnapshot = (nextSnapshot: FirebaseAuthSnapshot, force = false) => {
  if (!force && snapshot.ready === nextSnapshot.ready && snapshot.user === nextSnapshot.user) return;
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener(snapshot));
};

const confirmAuthUser = (user: User | null) => {
  const firstConfirmation = !hasConfirmedAuthState;
  hasConfirmedAuthState = true;
  try {
    // Record the returning-user hint as soon as Auth resolves. Waiting for
    // role/chat reads left fast reloads looking like guest visits.
    if (user) localStorage.setItem("user_id", user.uid);
    else localStorage.removeItem("user_id");
  } catch {}
  emitSnapshot({ ready: true, user }, firstConfirmation);
};

const loadFirebaseAuthDeps = () => {
  authDepsPromise ??= import("./firebase-auth").then(
    ({ auth, getRedirectResult, onAuthStateChanged }) => ({ auth, getRedirectResult, onAuthStateChanged })
  );

  return authDepsPromise;
};

const ensureFirebaseAuthSubscription = () => {
  if (unsubscribeAuth || authInitialization) return;

  authInitialization = loadFirebaseAuthDeps()
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

      // currentUser is null until IndexedDB restoration finishes. Publishing
      // it earlier briefly displayed guest buttons for signed-in visitors.
      await auth.authStateReady();
      confirmAuthUser(redirectUser ?? auth.currentUser ?? null);

      unsubscribeAuth = onAuthStateChanged(auth, (user) => {
        confirmAuthUser(user ?? null);
      });
    })
    .catch((error) => {
      console.error("Failed to initialize Firebase auth state:", error);
      authDepsPromise = null;
      if (!hasConfirmedAuthState) emitSnapshot({ ready: true, user: null }, true);
    }).finally(() => {
      authInitialization = null;
    });
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
// subscription may still be initializing when a protected action happens.
// A protected action can therefore happen before the async Firebase
// restore has resolved and would otherwise read a still-stale snapshot
// before the async Firebase load has resolved. A genuinely logged-in admin
// clicking edit as their first interaction on the page would see "Не
// авторизовано" even though they're authenticated, because the check ran
// before the subscription had a chance to confirm it. This waits for the
// subscription to actually resolve (kicking it off immediately, not
// deferred) instead of trusting whatever snapshot happens to exist yet.
export const waitForFirebaseAuthReady = (): Promise<FirebaseAuthSnapshot> => {
  ensureFirebaseAuthSubscription();
  if (hasConfirmedAuthState) return Promise.resolve(snapshot);
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
  confirmAuthUser(user);
  ensureFirebaseAuthSubscription();
};

export const subscribeToFirebaseAuthState = (
  listener: (nextSnapshot: FirebaseAuthSnapshot) => void
) => {
  listeners.add(listener);
  listener(snapshot);

  // Guest rendering needs no SDK. Returning sessions and successful sign-ins
  // share immediate restoration; no idle timeout can hold the hero skeleton.
  if ((!hasConfirmedAuthState && hasPersistedAuthIntent()) || snapshot.user) {
    ensureFirebaseAuthSubscription();
  } else if (!snapshot.ready) {
    emitSnapshot({ ready: true, user: null });
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
