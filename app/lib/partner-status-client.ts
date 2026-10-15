'use client';
import type { User } from 'firebase/auth';

export type PartnerStatus = { isPartner: boolean; totalSpent: number };
const TTL_MS = 30_000;
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
    if (typeof value.isPartner !== 'boolean' || !Number.isFinite(value.totalSpent) || value.totalSpent < 0) {
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
    }
    return value;
  } finally {
    if (pending.get(user.uid) === request) pending.delete(user.uid);
  }
}
