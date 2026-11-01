"use client";

import { loadDeferredUi } from "./deferred-stylesheet";

let modulePromise: Promise<typeof import("app/components/AuthModal")> | null = null;

export const loadAuthModalModule = () => {
  modulePromise ??= loadDeferredUi(() => import("app/components/AuthModal")).catch((error: unknown) => {
    modulePromise = null;
    throw error;
  });
  return modulePromise;
};

export const preloadAuthModal = () => {
  void loadAuthModalModule().catch(() => undefined);
};

let accountPromise: Promise<typeof import("app/components/AccountInfo")> | null = null;

export const loadAccountInfoModule = () => {
  accountPromise ??= loadDeferredUi(() => import("app/components/AccountInfo")).catch((error: unknown) => {
    accountPromise = null;
    throw error;
  });
  return accountPromise;
};
