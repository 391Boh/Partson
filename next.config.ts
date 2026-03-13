/** @type {import('next').NextConfig} */
const path = require("path");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

const allowedDevOrigins = Array.from(
  new Set(
    ["192.168.0.100", ...(process.env.NEXT_ALLOWED_DEV_ORIGINS || "").split(",")]
      .map((value) => value.trim())
      .filter(Boolean)
  )
);

const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["leaflet", "react-leaflet"],
  allowedDevOrigins,
  experimental: {
    // Disable Turbopack's persistent dev cache to avoid local SST allocation failures.
    turbopackFileSystemCacheForDev: false,
  },
  images: {
    qualities: [75, 100],
  },
  turbopack: {
    // Keep Turbopack scoped to this project; avoids scanning parent workspace on Windows.
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
