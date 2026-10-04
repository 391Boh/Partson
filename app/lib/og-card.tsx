import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

// Shared 1200×630 Open Graph card in the site's visual language. Google uses
// og:image as a page-preview candidate and recommends ≥1200px-wide images
// for large previews; social networks need ≥600×315 for their big cards.
export const OG_CARD_SIZE = { width: 1200, height: 630 };
export const OG_CARD_CONTENT_TYPE = "image/png";

const asset = (name: string) => readFile(join(process.cwd(), "assets/og", name));

const loadShared = (() => {
  let shared: Promise<{ regular: Buffer; bold: Buffer; logo: string }> | null = null;
  return () => {
    shared ??= Promise.all([asset("exo2-600.ttf"), asset("exo2-800.ttf"), asset("partson-logo.png")]).then(
      ([regular, bold, logo]) => ({ regular, bold, logo: `data:image/png;base64,${logo.toString("base64")}` })
    );
    return shared;
  };
})();

export const loadOgPhoto = async (name: string) =>
  `data:image/jpeg;base64,${(await asset(name)).toString("base64")}`;

// satori can't decode WebP/AVIF, so public images (group previews, category
// icons) are normalized to PNG, fitted onto white for the product panel.
export const loadOgProductImage = async (publicPath: string) => {
  try {
    const source = await readFile(join(process.cwd(), "public", publicPath.replace(/^\/+/, "").split("?")[0]));
    const png = await sharp(source)
      .resize({ width: 520, height: 360, fit: "contain", background: "#ffffff" })
      .flatten({ background: "#ffffff" })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return undefined;
  }
};

export type OgCardOptions = {
  kicker: string;
  title: string;
  facts?: Array<{ value: string; label: string }>;
  /** data: URL of a JPEG shown on the right (see loadOgPhoto). */
  photo?: string;
  /** data: URL of a PNG product shot, shown framed on white (see loadOgProductImage). */
  productImage?: string;
  accent?: [string, string];
};

export async function renderOgCard({
  kicker,
  title,
  facts = [],
  photo,
  productImage,
  accent = ["#0ea5e9", "#14b8a6"],
}: OgCardOptions) {
  const { regular, bold, logo } = await loadShared();
  const [a, b] = accent;
  const textWidth = photo ? 690 : productImage ? 600 : 1072;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          fontFamily: "Exo 2",
          background: "linear-gradient(135deg, #f8fbff 0%, #eef7fd 55%, #ecfbf7 100%)",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -260,
            left: -200,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${a}33 0%, transparent 66%)`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -320,
            left: 380,
            width: 760,
            height: 760,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${b}2e 0%, transparent 66%)`,
          }}
        />
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 8, display: "flex", background: `linear-gradient(90deg, ${a}, ${b})` }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: textWidth + 128,
            height: "100%",
            padding: "56px 64px 48px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
              <img src={logo} width={128} height={70} alt="" />
              <div
                style={{
                  display: "flex",
                  padding: "8px 18px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.85)",
                  border: "2px solid rgba(15,23,42,0.08)",
                  fontSize: 22,
                  fontWeight: 600,
                  color: "#334155",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                }}
              >
                {kicker}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 36,
                fontSize: title.length > 48 ? 54 : 62,
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: -1.5,
                color: "#0f172a",
              }}
            >
              {title}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            {facts.length > 0 ? (
              <div style={{ display: "flex", gap: 16 }}>
                {facts.slice(0, 3).map((fact) => (
                  <div
                    key={fact.label}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      flex: 1,
                      padding: "16px 20px",
                      borderRadius: 20,
                      background: "rgba(255,255,255,0.9)",
                      border: "2px solid rgba(255,255,255,1)",
                      boxShadow: "0 12px 30px rgba(15,23,42,0.08)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        fontSize: fact.value.length > 11 ? 23 : 30,
                        fontWeight: 800,
                        color: a,
                        lineHeight: 1.1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {fact.value}
                    </div>
                    <div style={{ display: "flex", marginTop: 4, fontSize: 18, fontWeight: 600, color: "#64748b" }}>{fact.label}</div>
                  </div>
                ))}
              </div>
            ) : null}
            <div style={{ display: "flex", fontSize: 21, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
              {textWidth < 690
                ? "partson.shop · Львів, вул. Перфецького, 8"
                : "partson.shop · Львів, вул. Перфецького, 8 · +38 (063) 421-18-51"}
            </div>
          </div>
        </div>

        {productImage && !photo ? (
          <div
            style={{
              display: "flex",
              position: "absolute",
              top: 135,
              right: 56,
              width: 400,
              height: 300,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 32,
              background: "#ffffff",
              border: "2px solid rgba(255,255,255,1)",
              boxShadow: `0 24px 60px rgba(15,23,42,0.12), 0 0 0 8px ${a}14`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
            <img src={productImage} width={360} height={250} alt="" style={{ objectFit: "contain", width: 360, height: 250 }} />
          </div>
        ) : null}

        {photo ? (
          <div style={{ display: "flex", position: "absolute", top: 0, right: 0, bottom: 0, width: 352 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- satori renders plain <img> */}
            <img src={photo} width={352} height={630} alt="" style={{ objectFit: "cover", width: 352, height: 630 }} />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: 120,
                display: "flex",
                background: "linear-gradient(90deg, #f1f8fc 0%, rgba(241,248,252,0) 100%)",
              }}
            />
          </div>
        ) : null}
      </div>
    ),
    {
      ...OG_CARD_SIZE,
      fonts: [
        { name: "Exo 2", data: regular, weight: 600, style: "normal" },
        { name: "Exo 2", data: bold, weight: 800, style: "normal" },
      ],
    }
  );
}
