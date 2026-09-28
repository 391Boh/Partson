'use client';
import type { User } from 'firebase/auth';

export async function fetchPartnerStatus(user: User): Promise<{ isPartner: boolean; totalSpent: number }> {
  const response = await fetch('/api/partner-status', {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Не вдалося перевірити партнерство');
  return response.json();
}
