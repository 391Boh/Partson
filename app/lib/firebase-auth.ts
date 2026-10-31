import {
  browserLocalPersistence,
  browserPopupRedirectResolver,
  browserSessionPersistence,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from "firebase/auth";
import { app } from "./firebase-app";
import { GOOGLE_REDIRECT_PENDING_KEY } from "./auth-storage";

const hasPendingRedirect = () => {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(GOOGLE_REDIRECT_PENDING_KEY) === "1";
  } catch {
    return false;
  }
};

const initializeSessionAuth = () => {
  try {
    return initializeAuth(app, {
      // Keep Firebase's existing persistence hierarchy, including fallback
      // when IndexedDB is blocked. Ordinary session checks need no OAuth iframe.
      persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence],
      ...(hasPendingRedirect() ? { popupRedirectResolver: browserPopupRedirectResolver } : {}),
    });
  } catch (error) {
    // A hot reload can encounter an instance created with redirect support.
    if ((error as { code?: string })?.code === "auth/already-initialized") return getAuth(app);
    throw error;
  }
};

export const auth = initializeSessionAuth();
auth.languageCode = "uk";

// A single lazy entry with named exports lets bundlers omit unrelated Auth
// methods instead of retaining the entire firebase/auth namespace on startup.
export { getRedirectResult, onAuthStateChanged } from "firebase/auth";
