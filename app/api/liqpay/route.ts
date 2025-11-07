import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const PUBLIC_KEY = 'sandbox_i70369644191';
const PRIVATE_KEY = 'sandbox_ntR76LE9TM5fJ9h2KlGxUrkC95CoPpxxexvCbGVU';

function base64(str: string) {
  return Buffer.from(str).toString('base64');
}

function sha1(str: string) {
  return crypto.createHash('sha1').update(str).digest('base64');
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const json = JSON.stringify(body);
  const data = base64(json);
  const signature = sha1(PRIVATE_KEY + data + PRIVATE_KEY);

  return NextResponse.json({ data, signature });
}
