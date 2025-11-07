import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const street = searchParams.get('street');

  if (!street || street.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(street + ' Львів')}&limit=10`, // <— без lang=uk
      {
        headers: {
          'User-Agent': 'lviv-map-app/1.0 (lviv@example.com)',
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Photon API error: ${res.status}`);
    }

    const data = await res.json();

    const streets = Array.from(
      new Set(
        data.features
          .map((feature: any) => feature.properties?.street)
          .filter((s: string | undefined): s is string => typeof s === 'string')
      )
    );

    return NextResponse.json(streets);
  } catch (error) {
    console.error('Помилка при зверненні до Photon:', error);
    return NextResponse.json(
      { error: 'Помилка при зверненні до Photon' },
      { status: 500 }
    );
  }
}
