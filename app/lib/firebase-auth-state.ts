"use client";

import { useSyncExternalStore } from "react";
import type { User } from "firebase/auth";

type FirebaseAuthSnapshot = {
  ready: boolean;
  user: User | null;
};

type FirebaseAuthDeps = {
  auth: typeof import("../../firebase").auth;
  onAuthStateChanged: typeof import("firebase/auth").onAuthStateChanged;
};

let authDepsPromise: Promise<FirebaseAuthDeps> | null = null;
let unsubscribeAuth: (() => void) | null = null;
let authSubscriptionScheduled = false;

const getInitialClientSnapshot = (): FirebaseAuthSnapshot => {
  if (typeof window === "undefined") return { ready: false, user: null };
  try {
    const uid = localStorage.getItem("user_id");
    if (!uid) return { ready: true, user: null };
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
    onAuthStateChanged: authModule.onAuthStateChanged,
  }));

  return authDepsPromise;
};

const ensureFirebaseAuthSubscription = () => {
  if (unsubscribeAuth) return;

  void loadFirebaseAuthDeps()
    .then(({ auth, onAuthStateChanged }) => {
      emitSnapshot({
        ready: true,
        user: auth.currentUser ?? null,
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

export const getFirebaseAuthSnapshot = () => snapshot;

export const subscribeToFirebaseAuthState = (
  listener: (nextSnapshot: FirebaseAuthSnapshot) => void
) => {
  listeners.add(listener);
  listener(snapshot);
  scheduleFirebaseAuthSubscription();

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
