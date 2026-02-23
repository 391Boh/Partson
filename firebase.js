// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const projectId =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    process.env.NEXT_PUBLIC_FIREBASE_KEY ||
    "",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "",
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
