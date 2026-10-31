// Compatibility entry point. Startup auth imports firebase-auth directly,
// so restoring a session does not also evaluate Firestore and Storage.
export { app } from "./app/lib/firebase-app";
export { auth } from "./app/lib/firebase-auth";
export { db } from "./app/lib/firebase-firestore";
export { storage } from "./app/lib/firebase-storage";
