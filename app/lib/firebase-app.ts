import { getApps, initializeApp } from "firebase/app";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "";

// Google sign-in runs on the auth domain. On partson.shop that is the site
// itself: nginx proxies /__/auth/ to Firebase, so the sign-in result is
// stored first-party. With the default *.firebaseapp.com, Safari (and other
// browsers that partition third-party storage) completed the Google step but
// the site never saw the result, so the visitor stayed signed out.
// Requires https://partson.shop/__/auth/handler among the OAuth client's
// authorized redirect URIs.
// Off until both are in place: the server has no /__/auth/ proxy yet and the
// redirect URIs are not added, so turning it on would break Google sign-in
// everywhere. Flip to true once https://partson.shop/__/auth/handler answers.
const SAME_ORIGIN_AUTH_ENABLED = false;
const SAME_ORIGIN_AUTH_HOSTS = new Set(["partson.shop", "www.partson.shop"]);
function resolveAuthDomain() {
  if (
    SAME_ORIGIN_AUTH_ENABLED &&
    typeof window !== "undefined" &&
    SAME_ORIGIN_AUTH_HOSTS.has(window.location.hostname)
  ) {
    return window.location.hostname;
  }
  return process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
}

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_KEY ||
    "",
  authDomain: resolveAuthDomain(),
  projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
    "",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
  measurementId:
    process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ||
    "",
};

const missingFirebaseVars = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
].filter((key) => {
  switch (key) {
    case "NEXT_PUBLIC_FIREBASE_API_KEY":
      return !firebaseConfig.apiKey;
    case "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN":
      return !firebaseConfig.authDomain;
    case "NEXT_PUBLIC_FIREBASE_PROJECT_ID":
      return !firebaseConfig.projectId;
    case "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET":
      return !firebaseConfig.storageBucket;
    case "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID":
      return !firebaseConfig.messagingSenderId;
    case "NEXT_PUBLIC_FIREBASE_APP_ID":
      return !firebaseConfig.appId;
    default:
      return false;
  }
});

if (missingFirebaseVars.length > 0) {
  throw new Error(
    `Firebase env is not configured. Missing: ${missingFirebaseVars.join(", ")}`
  );
}

// Reuse the default app across lazy entry points and development reloads.
export const app = getApps().find((app) => app.name === "[DEFAULT]") ?? initializeApp(firebaseConfig);
