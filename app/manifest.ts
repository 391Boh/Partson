import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PartsON - Магазин автозапчастин",
    short_name: "PartsON",
    description:
      "Каталог автозапчастин, підбір товарів і швидке замовлення онлайн.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f172a",
    icons: [
      {
        src: "/favicon-partson-v2-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/favicon-partson-v2-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
