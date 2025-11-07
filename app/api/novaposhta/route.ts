import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const response = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        apiKey: process.env.NP_API_KEY, // 🔑 обов'язково НЕ public
        ...body
      }),
    });

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Помилка в API Нової Пошти:', error);
    return NextResponse.json({ error: 'Помилка при обробці запиту' }, { status: 500 });
  }
}
