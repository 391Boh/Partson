import { ImageResponse } from "next/og";

import { getOgFonts } from "app/lib/og-fonts";

export const runtime = "nodejs";

export const alt = "PartsON - Каталог автозапчастин";
export const size = {
  width: 1200,
  height: 600,
};
export const contentType = "image/png";

export default async function TwitterImage() {
  const fonts = await getOgFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "52px 60px",
          background:
            "radial-gradient(circle at 12% 16%, rgba(34, 211, 238, 0.28), transparent 36%), radial-gradient(circle at 86% 10%, rgba(56, 189, 248, 0.28), transparent 34%), linear-gradient(135deg, #082f49 0%, #0f172a 56%, #1d4ed8 100%)",
          color: "#f8fafc",
          fontFamily: "Montserrat, Arial, sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 32,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          PartsON
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            maxWidth: 960,
          }}
        >
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: "-0.04em",
            }}
          >
            Магазин автозапчастин
          </div>
          <div
            style={{
              fontSize: 34,
              lineHeight: 1.2,
              color: "rgba(226, 232, 240, 0.95)",
              fontWeight: 600,
            }}
          >
            Актуальна наявність. Каталог. Швидкий підбір.
          </div>
        </div>

        <div
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "rgba(186, 230, 253, 0.95)",
          }}
        >
          partson.shop
        </div>
      </div>
    ),
    {
      ...size,
      fonts,
    }
  );
}
