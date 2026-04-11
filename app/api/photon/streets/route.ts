import { NextRequest, NextResponse } from 'next/server';

type PhotonFeature = {
  properties?: {
    street?: unknown;
  };
};

type PhotonResponse = {
  features?: PhotonFeature[];
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const street = searchParams.get('street');

  if (!street || street.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const res = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(street + ' Львів')}`, // limit прибрано, щоб не обрізати результати
      {
        headers: {
          'User-Agent': 'lviv-map-app/1.0 (lviv@example.com)',
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Photon API error: ${res.status}`);
    }

    const data = (await res.json()) as PhotonResponse;

    const streets = Array.from(
      new Set(
        (data.features || [])
          .map((feature) => feature.properties?.street)
          .filter((street): street is string => typeof street === 'string')
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
