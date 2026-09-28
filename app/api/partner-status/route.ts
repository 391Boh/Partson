import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from 'app/lib/firebase-admin';
import { resolvePartnerStatusByUid } from 'app/api/_lib/partner-auth';

export async function GET(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  let uid: string;
  try {
    if (!token) throw new Error('Missing token');
    uid = (await getFirebaseAdminAuth().verifyIdToken(token)).uid;
  } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  try {
    return NextResponse.json(await resolvePartnerStatusByUid(uid), { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Статус тимчасово недоступний' }, { status: 503 }); }
}
