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
        src: "/Car-parts-fullwidth.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/Car-parts-fullwidth.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
