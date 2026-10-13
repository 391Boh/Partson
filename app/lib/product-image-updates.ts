"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { buildProductImageBatchKey } from "./product-image-path";
import { clearProductImageMissing, clearProductImageSuccess } from "./product-image-client";

type ImageUpdate = { token: string; previewSrc: string };
const EMPTY: ImageUpdate = { token: "", previewSrc: "" };
const PREFIX = "partson:product-image-bust:";
const updates = new Map<string, ImageUpdate>();
const listeners = new Map<string, Set<() => void>>();
let lastVersion = 0;
const identity = (code: string) => code.trim().toLowerCase();
const serverSnapshot = () => EMPTY;

function publish(code: string, update: ImageUpdate) {
  updates.set(code, update);
  listeners.get(code)?.forEach(listener => listener());
  // Prepared previews are transient; retain only a small set of inactive
  // products rather than accumulating data URLs during an admin session.
  if (updates.size > 24) {
    for (const key of updates.keys()) {
      if (key !== code && !listeners.has(key)) updates.delete(key);
      if (updates.size <= 24) break;
    }
  }
}

/** Call only after the server confirms a successful main-photo replacement. */
export function notifyProductImageUpdated(code: string, article?: string, previewSrc = "") {
  if (typeof window === "undefined" || !code.trim()) return;
  lastVersion = Math.max(Date.now(), lastVersion + 1);
  const token = String(lastVersion);
  for (const hint of new Set([undefined, article])) {
    clearProductImageSuccess(code, hint);
    clearProductImageMissing(code, hint);
    try { window.localStorage.setItem(PREFIX + buildProductImageBatchKey(code, hint), token); } catch {}
  }
  publish(identity(code), { token, previewSrc });
}

/** Every mounted view of the same product updates without a page refresh. */
export function useProductImageUpdate(code: string, article?: string) {
  const key = identity(code);
  const subscribe = useCallback((listener: () => void) => {
    let group = listeners.get(key);
    if (!group) { group = new Set(); listeners.set(key, group); }
    group.add(listener);
    return () => {
      group.delete(listener);
      if (!group.size) listeners.delete(key);
    };
  }, [key]);
  const snapshot = useCallback(() => updates.get(key) ?? EMPTY, [key]);
  const update = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  useEffect(() => {
    if (!key || updates.has(key)) return;
    try {
      const token = window.localStorage.getItem(PREFIX + buildProductImageBatchKey(code)) ||
        window.localStorage.getItem(PREFIX + buildProductImageBatchKey(code, article)) || "";
      if (token) publish(key, { token, previewSrc: "" });
    } catch {}
  }, [key, code, article]);
  return update;
}
