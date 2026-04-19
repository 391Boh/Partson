import { ImageResponse } from "next/og";

export const runtime = "nodejs";

export const alt = "PartsON - Магазин автозапчастин";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "56px 64px",
          background:
            "radial-gradient(circle at 10% 15%, rgba(56, 189, 248, 0.35), transparent 35%), radial-gradient(circle at 90% 8%, rgba(14, 165, 233, 0.32), transparent 32%), linear-gradient(135deg, #0f172a 0%, #1e3a8a 52%, #0369a1 100%)",
          color: "#f8fafc",
          fontFamily: "Inter, Segoe UI, Arial, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 34,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "linear-gradient(180deg, #22d3ee, #0ea5e9)",
              boxShadow: "0 0 16px rgba(34, 211, 238, 0.9)",
            }}
          />
          PartsON
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 18,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 76,
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: "-0.04em",
            }}
          >
            Каталог автозапчастин
          </div>
          <div
            style={{
              fontSize: 36,
              lineHeight: 1.25,
              color: "rgba(226, 232, 240, 0.95)",
              fontWeight: 600,
            }}
          >
            Швидкий підбір за кодом, артикулом і виробником
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 28,
            color: "rgba(224, 242, 254, 0.95)",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            <span>Львів</span>
            <span style={{ opacity: 0.7 }}>•</span>
            <span>Доставка по Україні</span>
          </div>
          <div style={{ fontWeight: 700 }}>partson.shop</div>
        </div>
      </div>
    ),
    size
  );
}
