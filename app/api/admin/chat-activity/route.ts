import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from 'app/api/_lib/admin-auth';
import { getFirebaseAdminAuth, getFirebaseAdminDb } from 'app/lib/firebase-admin';

export const dynamic = 'force-dynamic';
const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/') && value !== '.' && value !== '..';
const response = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: NextRequest) {
  if (!await verifyAdminRequest(request)) return response({ error: 'Доступ заборонено' }, 403);
  const userId = request.nextUrl.searchParams.get('userId');
  if (!validId(userId)) return response({ error: 'Некоректний чат' }, 400);
  try {
    const snapshot = await getFirebaseAdminDb().collection('adminChatActivity').doc(userId).collection('messages').get();
    return response({ activity: Object.fromEntries(snapshot.docs.map(doc => [doc.id, doc.data()])) });
  } catch {
    return response({ error: 'Не вдалося завантажити дії адміністраторів' }, 503);
  }
}

export async function POST(request: NextRequest) {
  const admin = await verifyAdminRequest(request);
  if (!admin) return response({ error: 'Доступ заборонено' }, 403);
  const body = await request.json().catch(() => null);
  if (!body || !validId(body.userId)) return response({ error: 'Некоректний чат' }, 400);
  const { userId, action } = body;
  if (!['view', 'mark', 'reply'].includes(action)) return response({ error: 'Некоректна дія' }, 400);
  try {
    const db = getFirebaseAdminDb();
    const profile = await db.collection('users').doc(admin.uid).get();
    const authUser = profile.data()?.name ? null : await getFirebaseAdminAuth().getUser(admin.uid);
    const name = String(profile.data()?.name || authUser?.displayName || `Адміністратор ${admin.uid.slice(-6)}`).slice(0, 120);
    const actor = { name, at: Date.now() };
    if (action === 'reply') {
      if (!validId(body.requestId) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 10000 || !['text', 'product'].includes(body.type)) {
        return response({ error: 'Некоректне повідомлення' }, 400);
      }
      const product: Record<string, string | number> = {};
      if (body.type === 'product') {
        if (!body.product || typeof body.product.name !== 'string') return response({ error: 'Некоректний товар' }, 400);
        for (const key of ['name', 'code', 'article', 'producer', 'quantity', 'price', 'link', 'imageUrl']) {
          const value = body.product[key];
          if (typeof value === 'string' && value.length <= 4000 || typeof value === 'number' && Number.isFinite(value)) product[key] = value;
        }
      }
      const ref = db.collection('messages').doc(body.requestId);
      const saved = await db.runTransaction(async tx => {
        const existing = await tx.get(ref);
        if (existing.exists) return existing.data()?.repliedByUid === admin.uid && existing.data()?.userId === userId && existing.data()?.text === body.text.trim() && existing.data()?.type === body.type;
        tx.create(ref, { userId, text: body.text.trim(), sender: 'manager', type: body.type,
          ...(body.type === 'product' ? { product } : {}), createdAt: new Date(), readByAdmin: true,
          readByUser: false, textRead: false, repliedByUid: admin.uid, repliedByName: name });
        return true;
      });
      return response(saved ? { ok: true } : { error: 'Конфлікт повідомлення' }, saved ? 200 : 409);
    }
    const ids = body.messageIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(validId) || (action === 'mark' && (ids.length !== 1 || typeof body.active !== 'boolean'))) {
      return response({ error: 'Некоректні повідомлення' }, 400);
    }
    await db.runTransaction(async tx => {
      const refs = [...new Set<string>(ids)].map(id => db.collection('messages').doc(id));
      const messages = await tx.getAll(...refs);
      for (const message of messages) {
        if (!message.exists || message.data()?.userId !== userId) continue;
        const ref = db.collection('adminChatActivity').doc(userId).collection('messages').doc(message.id);
        // Nested merge keeps each administrator's activity independent.
        tx.set(ref, { [action === 'view' ? 'viewers' : 'marks']: { [admin.uid]: { ...actor, ...(action === 'mark' ? { active: body.active } : {}) } } }, { merge: true });
        if (action === 'view' && message.data()?.sender === 'user') tx.update(message.ref, { readByAdmin: true });
      }
    });
    return response({ ok: true });
  } catch {
    return response({ error: 'Не вдалося зберегти дію. Спробуйте ще раз.' }, 503);
  }
}
