import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://oauth.telegram.org https://static.liqpay.ua https://apis.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
  "script-src-elem 'self' 'unsafe-inline' https://telegram.org https://oauth.telegram.org https://static.liqpay.ua https://apis.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://telegram.org https://oauth.telegram.org https://www.google.com https://maps.google.com https://www.google.com.ua https://www.googletagmanager.com https://*.liqpay.ua https://*.firebaseapp.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
];

const isProduction = process.env.NODE_ENV === "production";
const nextDistDir = process.env.NEXT_DIST_DIR || ".next";

const nextConfig: NextConfig = {
  distDir: nextDistDir,
  poweredByHeader: false,
  compress: true,
  experimental: {
    optimizeCss: true,
    viewTransition: true,
    staleTimes: {
      dynamic: 1800,
      static: 7200,
    },
    optimizePackageImports: [
      "lucide-react",
      "react-icons",
      "framer-motion",
      "firebase/app",
      "firebase/auth",
      "firebase/firestore",
      "firebase/storage",
    ],
  },
  webpack(config, { dev }) {
    if (dev) {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        aggregateTimeout: 180,
        ignored: ["**/.git/**", "**/.next/**", "**/.next-dev/**", "**/node_modules/**"],
        poll: 1000,
      };
    }

    return config;
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "192.168.0.100",
    "192.168.0.101",
    "192.168.192.80",
    "192.168.0.102",
    "192.168.0.103",
    "172.20.10.2",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    qualities: [60, 75, 85],
    deviceSizes: [360, 420, 640, 768, 1024, 1280, 1536, 1920],
    imageSizes: [32, 48, 64, 96, 128, 192, 256, 320],
    localPatterns: [
      // Keep default strict behavior for regular local images (no query string).
      { pathname: "/**", search: "" },
      // Allow article hint query for dynamic product image endpoint.
      { pathname: "/product-image/**" },
    ],
  },
  async redirects() {
    return [
      {
        source: "/inform",
        destination: "/inform/delivery",
        permanent: true,
      },
    ];
  },
  async headers() {
    if (!isProduction) {
      return [];
    }

    return [
      {
        source: "/fonts/:path*",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:file((?!_next)[^?#]*\\.(?:png|jpg|jpeg|webp|avif|svg|ico|webmanifest))",
        headers: [
          ...securityHeaders,
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

async function buildConfig(): Promise<NextConfig> {
  if (process.env.ANALYZE === "true") {
    const { default: withBundleAnalyzer } = await import("@next/bundle-analyzer");
    return withBundleAnalyzer({ enabled: true, openAnalyzer: false })(nextConfig);
  }
  return nextConfig;
}

export default buildConfig();
