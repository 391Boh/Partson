import { initializeFirestore } from "firebase/firestore";
import { app } from "./firebase-app";
import "./firebase-auth";

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
