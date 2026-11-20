"use client";

export const safeGetStorageItem = (
  storage: Storage | null | undefined,
  key: string
) => {
  if (!storage || !key) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

export const safeSetStorageItem = (
  storage: Storage | null | undefined,
  key: string,
  value: string
) => {
  if (!storage || !key) return false;

  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

export const safeRemoveStorageItem = (
  storage: Storage | null | undefined,
  key: string
) => {
  if (!storage || !key) return;

  try {
    storage.removeItem(key);
  } catch {}
};

