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
let snapshot: FirebaseAuthSnapshot = {
  ready: false,
  user: null,
};
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

export const getFirebaseAuthSnapshot = () => snapshot;

export const subscribeToFirebaseAuthState = (
  listener: (nextSnapshot: FirebaseAuthSnapshot) => void
) => {
  listeners.add(listener);
  listener(snapshot);
  ensureFirebaseAuthSubscription();

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
