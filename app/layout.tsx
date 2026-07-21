import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Script from "next/script";
import ClientWrapper from "./client-wrapper";
import LayoutHost from "./components/LayoutHost";
import PageLoadingShell from "./components/PageLoadingShell";
import { WebVitalsReporter } from "./components/WebVitalsReporter";
import AnalyticsRuntime from "./components/AnalyticsRuntime";
import DeferredFooter from "./components/DeferredFooter";
import {
  STORE_PHONE_SEO_LABEL,
  trimSeoDescription,
} from "./lib/seo-metadata";
import { getSiteUrl } from "./lib/site-url";
import { getGoogleRating } from "./lib/google-rating";
import { safeJsonLd } from "./lib/safe-json-ld";

// The global stylesheet is intentionally NOT `import`-ed here. A plain
// `import "./globals.css"` gets turned by Next.js/React 19 into an
// auto-injected, render-blocking `<link rel="stylesheet" data-precedence>`
// tag — and App Router has no supported way to defer or critical-inline
// that (experimental.optimizeCss only ever wired into the legacy Pages
// Router). Instead scripts/build-static-css.mjs compiles it standalone into
// a plain static file, loaded below via preload + async-apply so first
// paint isn't gated on the whole ~550KB bundle.
const resolveGlobalStylesheetHref = (): string => {
  if (process.env.NODE_ENV === "production") {
    try {
      const manifestPath = path.join(process.cwd(), "public", "styles", "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { href?: string };
      if (manifest.href) return manifest.href;
    } catch (error) {
      console.error(
        "[layout] public/styles/manifest.json missing or invalid — did `npm run build:css` run before `next build`?",
        error
      );
    }
    return "/styles/site.css";
  }

  // Dev: cache-bust on every request using the watcher's last rebuild time,
  // so a Tailwind rebuild is never masked by a stale browser cache.
  try {
    const devCssPath = path.join(process.cwd(), "public", "styles", "dev.css");
    const mtimeMs = statSync(devCssPath).mtimeMs;
    return `/styles/dev.css?t=${Math.floor(mtimeMs)}`;
  } catch {
    return "/styles/dev.css";
  }
};

const siteUrl = getSiteUrl();
const siteUrlObject = (() => {
  try {
    return new URL(siteUrl);
  } catch {
    return new URL("http://localhost:3000");
  }
})();

const organizationId = `${siteUrl}#organization`;
const localBusinessId = `${siteUrl}#local-business`;
const organizationLogoUrl = `${siteUrl}/Car-parts-fullwidth.png`;

const parseNumericEnv = (value: string | undefined) => {
  if (!value) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const storeLatitude = parseNumericEnv(process.env.NEXT_PUBLIC_STORE_LAT);
const storeLongitude = parseNumericEnv(process.env.NEXT_PUBLIC_STORE_LNG);
const googleBusinessProfileUrl = (process.env.NEXT_PUBLIC_GBP_URL || "").trim();
const socialLinks = (process.env.NEXT_PUBLIC_SOCIAL_LINKS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const sameAsLinks = Array.from(
  new Set([googleBusinessProfileUrl, ...socialLinks].filter(Boolean))
);
const googleTagManagerId = (() => {
  const rawId = (
    process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID ||
    process.env.GOOGLE_TAG_MANAGER_ID ||
    ""
  )
    .trim()
    .toUpperCase();

  return /^GTM-[A-Z0-9]+$/.test(rawId) ? rawId : "";
})();
const googleAnalyticsId = (() => {
  const rawId = (
    process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ||
    process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ||
    process.env.GOOGLE_ANALYTICS_ID ||
    ""
  )
    .trim()
    .toUpperCase();

  return /^G-[A-Z0-9]+$/.test(rawId) ? rawId : "";
})();
const analyticsEnabledInCurrentEnvironment =
  process.env.NODE_ENV === "production" ||
  process.env.NEXT_PUBLIC_ANALYTICS_ENABLE_IN_DEVELOPMENT === "1";
// GTM is the preferred single loader. The direct Google tag is a working
// fallback for installations that only provide a GA4 Measurement ID.
const analyticsMode = !analyticsEnabledInCurrentEnvironment
  ? "disabled"
  : googleTagManagerId
    ? "gtm"
    : googleAnalyticsId
      ? "gtag"
      : "disabled";
const analyticsEnabled = analyticsMode !== "disabled";
const analyticsConsentBootstrap = `
  (function(w,d){
    w.dataLayer=w.dataLayer||[];
    w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};
    w.__PARTSON_ANALYTICS_MODE__=${JSON.stringify(analyticsMode)};
    var match=d.cookie.match(/(?:^|;\\s*)partson_analytics_consent=([^;]*)/);
    var choice=match?decodeURIComponent(match[1]):'';
    var analyticsGranted=choice==='granted';
    d.documentElement.setAttribute(
      'data-analytics-consent',
      choice==='granted'||choice==='denied'?choice:'unset'
    );
    w.gtag('consent','default',{
      analytics_storage:analyticsGranted?'granted':'denied',
      ad_storage:'denied',
      ad_user_data:'denied',
      ad_personalization:'denied',
      functionality_storage:'granted',
      security_storage:'granted',
      wait_for_update:500
    });
    w.gtag('set','ads_data_redaction',true);
  })(window,document);
`;

const rootDescription = trimSeoDescription(
  `PartsON — автозапчастини у Львові: великий асортимент, підбір за VIN, кодом чи артикулом, оригінали та аналоги, доставка по Україні. ${STORE_PHONE_SEO_LABEL}.`
);
const rootSocialDescription = trimSeoDescription(
  `Автозапчастини у Львові — каталог PartsON з підбором за VIN, кодом та артикулом, великим асортиментом і доставкою по Україні. ${STORE_PHONE_SEO_LABEL}.`
);

export const metadata: Metadata = {
  metadataBase: siteUrlObject,
  title: {
    default: "PartsON - Магазин автозапчастин",
    template: "%s | PartsON",
  },
  description: rootDescription,
  applicationName: "PartsON",
  category: "auto parts",
  keywords: [
    "автозапчастини",
    "автозапчастини львів",
    "каталог автозапчастин",
    "магазин запчастин",
    "магазин автозапчастин перфецького",
    "доставка автозапчастин львів",
    "купити запчастини",
    "виробники автозапчастин",
    "PartsON",
  ],
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-48x48.png", type: "image/png", sizes: "48x48" },
      { url: "/favicon-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/favicon-512x512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "uk_UA",
    url: siteUrl,
    siteName: "PartsON",
    title: "PartsON - Магазин автозапчастин",
    description: rootSocialDescription,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "PartsON - автозапчастини",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PartsON - Магазин автозапчастин",
    description: rootSocialDescription,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "PartsON - автозапчастини" }],
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${siteUrl}#website`,
  name: "PartsON",
  url: siteUrl,
  inLanguage: "uk-UA",
  description:
    "PartsON — каталог автозапчастин із пошуком за назвою, артикулом, кодом, виробником і автомобілем.",
  publisher: { "@id": organizationId },
  hasPart: [
    {
      "@type": "CollectionPage",
      name: "Каталог автозапчастин",
      url: `${siteUrl}/katalog`,
    },
    {
      "@type": "CollectionPage",
      name: "Групи автозапчастин",
      url: `${siteUrl}/groups`,
    },
    {
      "@type": "CollectionPage",
      name: "Виробники автозапчастин",
      url: `${siteUrl}/manufacturers`,
    },
    {
      "@type": "CollectionPage",
      name: "Підбір за автомобілем",
      url: `${siteUrl}/auto`,
    },
  ],
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteUrl}/katalog?search={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

const siteNavigationJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: "Каталог",
    url: `${siteUrl}/katalog`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: "Групи товарів",
    url: `${siteUrl}/groups`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: "Виробники",
    url: `${siteUrl}/manufacturers`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    name: "Інформація",
    url: `${siteUrl}/inform`,
  },
];

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": organizationId,
  additionalType: "https://schema.org/AutoPartsStore",
  name: "PartsON",
  url: siteUrl,
  logo: {
    "@type": "ImageObject",
    url: `${organizationLogoUrl}`,
    width: 512,
    height: 512,
  },
  image: [`${organizationLogoUrl}`],
  sameAs: sameAsLinks.length > 0 ? sameAsLinks : undefined,
  description:
    "Інтернет-магазин автозапчастин PartsON з каталогом, підбором деталей та доставкою по Україні.",
  areaServed: {
    "@type": "Country",
    name: "Україна",
  },
  knowsAbout: [
    "автозапчастини",
    "підбір запчастин за VIN",
    "пошук запчастин за артикулом",
    "оригінальні запчастини та аналоги",
    "доставка автозапчастин по Україні",
  ],
  email: "romaniukbboogg@gmail.com",
  telephone: "+380634211851",
  address: {
    "@type": "PostalAddress",
    streetAddress: "вул. Перфецького, 8",
    addressLocality: "Львів",
    addressCountry: "UA",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday"],
      opens: "08:00",
      closes: "16:00",
    },
  ],
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+380634211851",
      email: "romaniukbboogg@gmail.com",
      availableLanguage: ["uk", "ru"],
    },
  ],
};

const localBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoPartsStore",
  "@id": localBusinessId,
  name: "PartsON",
  url: siteUrl,
  image: [`${organizationLogoUrl}`],
  logo: `${organizationLogoUrl}`,
  description:
    "Магазин автозапчастин PartsON: підбір деталей, консультація та доставка по Україні.",
  priceRange: "$$",
  currenciesAccepted: "UAH",
  paymentAccepted: "Готівка, банківська картка, післяплата, безготівковий розрахунок",
  areaServed: {
    "@type": "Country",
    name: "Україна",
  },
  telephone: "+380634211851",
  email: "romaniukbboogg@gmail.com",
  parentOrganization: { "@id": organizationId },
  sameAs: sameAsLinks.length > 0 ? sameAsLinks : undefined,
  address: {
    "@type": "PostalAddress",
    streetAddress: "вул. Перфецького, 8",
    addressLocality: "Львів",
    addressCountry: "UA",
  },
  geo:
    storeLatitude != null && storeLongitude != null
      ? {
          "@type": "GeoCoordinates",
          latitude: storeLatitude,
          longitude: storeLongitude,
        }
      : undefined,
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "18:00",
    },
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Sunday"],
      opens: "08:00",
      closes: "16:00",
    },
  ],
};

const layoutFallback = <PageLoadingShell label="Завантаження сторінки..." cardsCount={4} />;

async function LocalBusinessJsonLdWithRating() {
  const googleRating = await getGoogleRating();
  const localBusinessWithRating = {
    ...localBusinessJsonLd,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: String(googleRating.ratingValue),
      reviewCount: String(googleRating.reviewCount),
      bestRating: "5",
      worstRating: "1",
    },
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: safeJsonLd(localBusinessWithRating) }}
    />
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const globalStylesheetHref = resolveGlobalStylesheetHref();

  return (
    <html lang="uk" suppressHydrationWarning>
      <head>
        {/* Plain, synchronous, render-blocking stylesheet — deliberately NOT
            preload+async-apply. That was tried and reverted: a <link> created
            via script during initial parsing still gets treated as render
            blocking by the browser in practice (it exists before first
            paint), so it bought no real non-blocking benefit while adding a
            real risk of a flash-of-unstyled-content race on cold loads/
            refreshes. See resolveGlobalStylesheetHref above for why this is
            a plain static file instead of a Next.js-managed import. */}
        <link rel="stylesheet" href={globalStylesheetHref} />
        <link
          rel="preload"
          href="/fonts/exo2-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        {analyticsEnabled ? (
          <Script
            id="partson-analytics-consent-default"
            strategy="beforeInteractive"
            dangerouslySetInnerHTML={{ __html: analyticsConsentBootstrap }}
          />
        ) : null}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(siteNavigationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd) }}
        />
      </head>
      <body>
        <AnalyticsRuntime
          enabled={analyticsEnabled}
          mode={analyticsMode === "gtm" ? "gtm" : "gtag"}
          googleTagManagerId={googleTagManagerId}
          googleAnalyticsId={googleAnalyticsId}
        />
        <WebVitalsReporter />
        <div className="page-scale-root">
          <ClientWrapper>
            <Suspense fallback={layoutFallback}>
              <LayoutHost>{children}</LayoutHost>
            </Suspense>
          </ClientWrapper>
          <DeferredFooter />
        </div>
        <Suspense>
          <LocalBusinessJsonLdWithRating />
        </Suspense>
      </body>
    </html>
  );
}
