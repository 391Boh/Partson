import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Static IPs go stale the moment the dev machine joins a different Wi-Fi/
// hotspot — every past network's address was hardcoded here and each new
// one silently broke LAN testing (Next.js's allowedDevOrigins check rejects
// unknown origins as an anti DNS-rebinding measure). Reading the machine's
// current interfaces means this list is always correct for whatever network
// you're actually on, with no manual upkeep.
const localNetworkAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((iface): iface is NonNullable<typeof iface> => Boolean(iface))
  .filter((iface) => iface.family === "IPv4" && !iface.internal)
  .map((iface) => iface.address);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https:",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org https://oauth.telegram.org https://static.liqpay.ua https://apis.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://a.plerdy.com",
  "script-src-elem 'self' 'unsafe-inline' https://telegram.org https://oauth.telegram.org https://static.liqpay.ua https://apis.google.com https://www.googletagmanager.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://a.plerdy.com",
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
  turbopack: {
    root: process.cwd(),
  },
  poweredByHeader: false,
  compress: true,
  experimental: {
    // Note: optimizeCss (critters-based critical CSS inlining) is intentionally
    // NOT enabled — it's only wired into Next's legacy Pages Router rendering
    // path, not the App Router this whole app uses, so it would be a no-op.
    // The global stylesheet is instead built standalone and loaded via
    // preload+async-apply — see scripts/build-static-css.mjs and app/layout.tsx.
    staleTimes: {
      dynamic: 1800,
      static: 7200,
    },
    // firebase/* used to be in this list too. This codebase lazily
    // `import()`s firebase/app, firebase/auth and firebase/firestore from
    // several places (app/lib/firebase-auth-state.ts, LayoutHost.tsx,
    // HeroAccountClient.tsx, Auto.tsx) so they land in their own async
    // webpack chunk rather than the main bundle. Combined with barrel-file
    // optimization, that chunk's `initializeApp` import resolved to an
    // object without the function on it at runtime ("... is not a
    // function"), reproducing on every load, not just a stale dev cache.
    // The tree-shaking win isn't worth breaking firebase init.
    optimizePackageImports: ["lucide-react", "react-icons", "framer-motion"],
    // Next.js auto-detects CPU count and spawns that many static-generation
    // workers (each rendering pages concurrently, each making its own live
    // 1C calls). The production VPS has only 1-2GB RAM total, and the live
    // PM2 processes (800MB + 200MB caps, see ecosystem.config.js) keep
    // running and serving traffic during a build — there's very little
    // headroom left for parallel render workers on top of that. Serializing
    // to one worker trades a longer build for not starving the box (this is
    // what dropped the SSH session mid-deploy at the default worker count).
    // Only forced on the production server (set BUILD_CPUS=1 there) — capping
    // it unconditionally made local builds (many more cores available)
    // dramatically slower for no benefit, some pages taking 60s+ each.
    ...(process.env.BUILD_CPUS
      ? { cpus: Math.max(1, Number(process.env.BUILD_CPUS) || 1) }
      : {}),
  },
  webpack(config, { dev }) {
    // Native filesystem events are considerably cheaper on a local disk.
    // Polling remains available explicitly through `npm run dev:poll` for
    // Docker/network volumes where native events may not arrive.
    if (dev && process.env.FORCE_DEV_POLLING === "1") {
      config.watchOptions = {
        ...(config.watchOptions || {}),
        aggregateTimeout: 180,
        ignored: ["**/.git/**", "**/.next/**", "**/.next-dev/**", "**/node_modules/**"],
        poll: 1000,
      };
    }

    return config;
  },
  allowedDevOrigins: ["localhost", "127.0.0.1", ...localNetworkAddresses],
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 31536000,
    qualities: [58, 60, 62, 70, 72, 75, 85, 90],
    deviceSizes: [360, 420, 512, 640, 768, 1024, 1280, 1536, 1920],
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
      // These three used to duplicate entries already covered by
      // groups-/manufacturers-/other-pages-sitemap.xml and were dropped from
      // the sitemap index (see app/lib/sitemap-sections.ts) — redirect any
      // stale GSC submissions or backlinks to the index instead of a 404.
      {
        source: "/sitemap-pages.xml",
        destination: "/sitemap.xml",
        permanent: true,
      },
      {
        source: "/sitemap-categories.xml",
        destination: "/sitemap.xml",
        permanent: true,
      },
      {
        source: "/sitemap-brands.xml",
        destination: "/sitemap.xml",
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
        // Content-hashed by scripts/build-static-css.mjs — safe to cache
        // forever since a new build always produces a new filename.
        source: "/styles/site.:hash([0-9a-f]{10}).css",
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
