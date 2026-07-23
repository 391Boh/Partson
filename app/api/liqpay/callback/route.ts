import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { checkRateLimit, setRateLimitHeaders } from '../../_lib/rateLimit';
import { isNonEmptyString } from '../../_lib/requestValidation';
import { getFirebaseAdminDb } from 'app/lib/firebase-admin';

function sha1(str: string) {
  return crypto.createHash('sha1').update(str).digest('base64');
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCallbackPayload(raw: string, contentType: string | null) {
  if (!raw) return { data: '', signature: '' };

  if (contentType?.includes('application/json')) {
    try {
      const body = JSON.parse(raw) as Record<string, unknown>;
      return {
        data: typeof body.data === 'string' ? body.data : '',
        signature: typeof body.signature === 'string' ? body.signature : '',
      };
    } catch {
      return { data: '', signature: '' };
    }
  }

  const params = new URLSearchParams(raw);
  return {
    data: params.get('data') || '',
    signature: params.get('signature') || '',
  };
}

function decodeData(data: string) {
  try {
    const json = Buffer.from(data, 'base64').toString('utf8');
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const readString = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

const readAmount = (value: unknown) => {
  const amount = Number(readString(value).replace(',', '.'));
  return Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null;
};

const getPaymentStatus = (liqpayStatus: string) => {
  if (liqpayStatus === 'success') return 'paid';
  if (['failure', 'error', 'reversed'].includes(liqpayStatus)) return 'failed';
  return 'pending';
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: 'liqpay:callback',
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  const privateKey = process.env.LIQPAY_PRIVATE_KEY;
  if (!isNonEmptyString(privateKey, { maxLength: 256 })) {
    const misconfigured = NextResponse.json(
      { error: 'LiqPay private key is not configured' },
      { status: 500 }
    );
    setRateLimitHeaders(misconfigured.headers, rateResult);
    return misconfigured;
  }

  const raw = await req.text();
  if (raw.length > 16_000) {
    const tooLarge = NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    setRateLimitHeaders(tooLarge.headers, rateResult);
    return tooLarge;
  }

  const { data, signature } = parseCallbackPayload(raw, req.headers.get('content-type'));
  if (!isNonEmptyString(data, { maxLength: 12_000 }) || !isNonEmptyString(signature, { maxLength: 512 })) {
    const invalid = NextResponse.json({ error: 'Invalid callback payload' }, { status: 400 });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const expectedSignature = sha1(privateKey + data + privateKey);
  if (!safeEqual(expectedSignature, signature)) {
    const forbidden = NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    setRateLimitHeaders(forbidden.headers, rateResult);
    return forbidden;
  }

  const decoded = decodeData(data);
  if (!decoded) {
    const invalidData = NextResponse.json({ error: 'Invalid callback data' }, { status: 400 });
    setRateLimitHeaders(invalidData.headers, rateResult);
    return invalidData;
  }

  const liqpayStatus = readString(decoded.status).toLowerCase();
  const orderId = readString(decoded.order_id);
  const transactionId = readString(decoded.transaction_id);
  const paymentId = readString(decoded.payment_id);
  const callbackPublicKey = readString(decoded.public_key);
  const callbackCurrency = readString(decoded.currency).toUpperCase();
  const callbackAmount = readAmount(decoded.amount);
  const paymentStatus = getPaymentStatus(liqpayStatus);

  if (!orderId || !/^[A-Za-z0-9_-]+$/.test(orderId)) {
    const invalidOrder = NextResponse.json({ error: 'Callback has no order_id' }, { status: 400 });
    setRateLimitHeaders(invalidOrder.headers, rateResult);
    return invalidOrder;
  }

  try {
    const adminDb = getFirebaseAdminDb();
    const orderRef = adminDb.collection('orders').doc(orderId);
    const orderSnapshot = await orderRef.get();
    const expectedAmount = readAmount(orderSnapshot.data()?.totalAmount);
    const configuredPublicKey = readString(process.env.LIQPAY_PUBLIC_KEY);

    if (
      !orderSnapshot.exists ||
      expectedAmount == null ||
      callbackAmount == null ||
      expectedAmount !== callbackAmount ||
      callbackCurrency !== 'UAH' ||
      !configuredPublicKey ||
      callbackPublicKey !== configuredPublicKey
    ) {
      const mismatch = NextResponse.json(
        { error: 'LiqPay callback does not match the order' },
        { status: 409 }
      );
      setRateLimitHeaders(mismatch.headers, rateResult);
      return mismatch;
    }

    const now = new Date();
    await orderRef.set(
      {
        orderId,
        paymentMethod: 'Картка',
        paymentProvider: 'liqpay',
        paymentStatus,
        liqpayStatus,
        liqpayTransactionId: transactionId || null,
        liqpayPaymentId: paymentId || null,
        liqpayCallbackData: decoded,
        liqpayCallbackReceivedAt: now,
        updatedAt: now,
        ...(paymentStatus === 'paid' ? { paidAt: now } : {}),
      },
      { merge: true }
    );
  } catch (error) {
    console.error('Failed to persist LiqPay callback:', error);
    const failed = NextResponse.json(
      { error: 'Failed to update order payment status' },
      { status: 500 }
    );
    setRateLimitHeaders(failed.headers, rateResult);
    return failed;
  }

  const response = NextResponse.json({
    ok: true,
    status: liqpayStatus || null,
    paymentStatus,
    orderId,
    transactionId: transactionId || null,
  });
  setRateLimitHeaders(response.headers, rateResult);
  return response;
}
