import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from 'app/api/_lib/admin-auth';
import { invalidatePartnerStatus } from 'app/api/_lib/partner-auth';
import { getFirebaseAdminDb } from 'app/lib/firebase-admin';

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  if (!await verifyAdminRequest(request)) return json({ error: 'Доступ заборонено' }, 403);
  try {
    const snapshot = await getFirebaseAdminDb().collection('partnerGrants').where('active', '==', true).get();
    return json({ uids: snapshot.docs.map(doc => doc.id) });
  } catch { return json({ error: 'Не вдалося завантажити партнерів' }, 503); }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return json({ error: 'Доступ заборонено' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || typeof body.uid !== 'string' || !body.uid.trim() || body.uid.length > 128 || body.uid.includes('/') || ['.', '..'].includes(body.uid) || typeof body.active !== 'boolean') {
    return json({ error: 'Некоректний користувач або статус' }, 400);
  }
  try {
    const db = getFirebaseAdminDb();
    if (!(await db.collection('users').doc(body.uid).get()).exists) return json({ error: 'Користувача не знайдено' }, 404);
    // Private collection: user profile writes cannot grant partner access.
    await db.collection('partnerGrants').doc(body.uid).set({ active: body.active, updatedByUid: admin.uid, updatedAt: new Date() });
    invalidatePartnerStatus(body.uid);
    return json({ ok: true, uid: body.uid, active: body.active });
  } catch { return json({ error: 'Не вдалося змінити партнерство' }, 503); }
}
