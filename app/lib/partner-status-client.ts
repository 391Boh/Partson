'use client';
import type { User } from 'firebase/auth';
import { rememberPartnerPriceHint } from 'app/lib/partner-price-hint';

export type PartnerStatus = { isPartner: boolean; totalSpent: number };
const TTL_MS = 30_000;
const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
const previewKey = (uid: string) => `partson:achievement-preview:${uid}`;
const previews = new Map<string, { value: PartnerStatus; savedAt: number }>();
const isValidStatus = (value: unknown): value is PartnerStatus => {
  if (!value || typeof value !== 'object') return false;
  const status = value as PartnerStatus;
  return typeof status.isPartner === 'boolean' && Number.isFinite(status.totalSpent) && status.totalSpent >= 0;
};

/** Cosmetic preview only. Never use this stale snapshot for prices or access. */
export function getPartnerStatusPreview(uid: string): PartnerStatus | null {
  const fresh = getCachedPartnerStatus(uid);
  if (fresh) return fresh;
  try {
    const saved = previews.get(uid) ?? (typeof sessionStorage !== 'undefined'
      ? JSON.parse(sessionStorage.getItem(previewKey(uid)) || 'null') : null);
    if (!saved || !isValidStatus(saved.value) || !Number.isFinite(saved.savedAt) ||
      saved.savedAt > Date.now() || Date.now() - saved.savedAt > PREVIEW_TTL_MS) return null;
    return saved.value;
  } catch { return null; }
}
function savePreview(uid: string, value: PartnerStatus) {
  const saved = { value, savedAt: Date.now() };
  if (previews.size >= 20) previews.delete(previews.keys().next().value!);
  previews.set(uid, saved);
  try { if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(previewKey(uid), JSON.stringify(saved)); } catch { /* Storage can be blocked. */ }
}
const cache = new Map<string, { value: PartnerStatus; expires: number }>();
const pending = new Map<string, Promise<PartnerStatus>>();

export function getCachedPartnerStatus(uid: string): PartnerStatus | null {
  const entry = cache.get(uid);
  if (!entry || entry.expires <= Date.now()) {
    cache.delete(uid);
    return null;
  }
  return entry.value;
}

export function invalidatePartnerStatusClient(uid: string) {
  cache.delete(uid);
  pending.delete(uid);
  previews.delete(uid);
  try { if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(previewKey(uid)); } catch { /* Storage can be blocked. */ }
}

export async function fetchPartnerStatus(user: User): Promise<PartnerStatus> {
  const cached = getCachedPartnerStatus(user.uid);
  if (cached) return cached;
  const existing = pending.get(user.uid);
  if (existing) return existing;
  const request = (async () => {
    const response = await fetch('/api/partner-status', {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('Не вдалося перевірити партнерство');
    const value = await response.json() as PartnerStatus;
    if (!isValidStatus(value)) {
      throw new Error('Некоректна сума замовлень');
    }
    return value;
  })();
  pending.set(user.uid, request);
  try {
    const value = await request;
    if (pending.get(user.uid) === request) {
      if (cache.size >= 20) cache.delete(cache.keys().next().value!);
      cache.set(user.uid, { value, expires: Date.now() + TTL_MS });
      savePreview(user.uid, value);
      rememberPartnerPriceHint(value.isPartner, user.uid);
    }
    return value;
  } finally {
    if (pending.get(user.uid) === request) pending.delete(user.uid);
  }
}
