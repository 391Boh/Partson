import { NextRequest, NextResponse } from 'next/server';

import { checkRateLimit, setRateLimitHeaders } from '../_lib/rateLimit';

type AllowedProps = readonly string[];

const ALLOWED_METHODS = new Map<string, AllowedProps>([
  ['Address.getCities',    ['FindByString', 'Limit', 'Page']],
  ['Address.getWarehouses', ['CityRef', 'FindByString', 'Limit', 'Page', 'TypeOfWarehouseRef']],
]);

const sanitizeMethodProperties = (
  props: unknown,
  allowedKeys: AllowedProps
): Record<string, unknown> => {
  if (!props || typeof props !== 'object' || Array.isArray(props)) return {};
  const source = props as Record<string, unknown>;
  const safe: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in source) safe[key] = source[key];
  }
  return safe;
};

export async function POST(req: NextRequest) {
  const rateResult = checkRateLimit({
    req,
    key: 'novaposhta',
    limit: 30,
    windowMs: 60_000,
  });
  if (!rateResult.ok) {
    const limited = NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    setRateLimitHeaders(limited.headers, rateResult);
    return limited;
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    const invalid = NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    setRateLimitHeaders(invalid.headers, rateResult);
    return invalid;
  }

  const modelName = typeof body.modelName === 'string' ? body.modelName.trim() : '';
  const calledMethod = typeof body.calledMethod === 'string' ? body.calledMethod.trim() : '';
  const methodKey = `${modelName}.${calledMethod}`;
  const allowedProps = ALLOWED_METHODS.get(methodKey);

  if (!allowedProps) {
    const forbidden = NextResponse.json(
      { error: 'Method not allowed' },
      { status: 403 }
    );
    setRateLimitHeaders(forbidden.headers, rateResult);
    return forbidden;
  }

  const methodProperties = sanitizeMethodProperties(body.methodProperties, allowedProps);

  try {
    const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.NP_API_KEY,
        modelName,
        calledMethod,
        methodProperties,
      }),
    });

    const data = await response.json();
    const res = NextResponse.json(data);
    setRateLimitHeaders(res.headers, rateResult);
    return res;
  } catch (error: unknown) {
    console.error('Nova Poshta API error:', error);
    const err = NextResponse.json({ error: 'Failed to reach Nova Poshta API' }, { status: 502 });
    setRateLimitHeaders(err.headers, rateResult);
    return err;
  }
}
