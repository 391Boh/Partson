import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const readServiceAccount = () => {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (rawJson) {
    const parsed = JSON.parse(rawJson) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key?.replace(/\\n/g, "\n"),
    };
  }

  return {
    projectId:
      process.env.FIREBASE_ADMIN_PROJECT_ID ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
      process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  };
};

const getFirebaseAdminApp = () => {
  const existing = getApps()[0];
  if (existing) return existing;

  const serviceAccount = readServiceAccount();
  if (
    !serviceAccount.projectId ||
    !serviceAccount.clientEmail ||
    !serviceAccount.privateKey
  ) {
    throw new Error(
      "Firebase Admin env is not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY or FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  return initializeApp({
    credential: cert(serviceAccount),
  });
};

export const getFirebaseAdminAuth = () => getAuth(getFirebaseAdminApp());

export const getFirebaseAdminDb = () => getFirestore(getFirebaseAdminApp());
