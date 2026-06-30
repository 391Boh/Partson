import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Script from "next/script";
import ClientWrapper from "./client-wrapper";
import LayoutHost from "./components/LayoutHost";
import PageLoadingShell from "./components/PageLoadingShell";
import { WebVitalsReporter } from "./components/WebVitalsReporter";
import {
  STORE_ADDRESS_SEO_LABEL,
  STORE_PHONE_SEO_LABEL,
  trimSeoDescription,
} from "./lib/seo-metadata";
import { getSiteUrl } from "./lib/site-url";
import { getGoogleRating } from "./lib/google-rating";
import { safeJsonLd } from "./lib/safe-json-ld";
import "./globals.css";

const siteUrl = getSiteUrl();
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
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

const rootDescription = trimSeoDescription(
  `PartsON - магазин автозапчастин у Львові з каталогом, цінами, наявністю та підбором за VIN, кодом і артикулом. ${STORE_PHONE_SEO_LABEL}. ${STORE_ADDRESS_SEO_LABEL}.`
);
const rootSocialDescription = trimSeoDescription(
  `Автозапчастини у Львові: каталог PartsON, підбір деталей за VIN і артикулом, самовивіз та доставка по Україні. ${STORE_PHONE_SEO_LABEL}. ${STORE_ADDRESS_SEO_LABEL}.`
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
    shortcut: ["/favicon-48x48.png"],
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
        url: "/Car-parts-fullwidth.png",
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
    images: [{ url: "/Car-parts-fullwidth.png", width: 1200, height: 630, alt: "PartsON - автозапчастини" }],
  },
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "PartsON",
  url: siteUrl,
  publisher: { "@id": organizationId },
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteUrl}/katalog?search={search_term_string}`,
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
  return (
    <html lang="uk">
      <head>
        <link rel="icon" href="/favicon-48x48.png" sizes="48x48" type="image/png" />
        <link rel="icon" href="/favicon-192x192.png" sizes="192x192" type="image/png" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
        <link
          rel="preload"
          href="/fonts/exo2-variable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/exo2-variable-italic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="preconnect" href="https://firebasestorage.googleapis.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://firebasestorage.googleapis.com" />
        <link rel="preconnect" href="https://lh3.googleusercontent.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://lh3.googleusercontent.com" />
        {googleTagManagerId ? (
          <link rel="preconnect" href="https://www.googletagmanager.com" crossOrigin="anonymous" />
        ) : null}
        {googleTagManagerId ? (
          <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        ) : null}
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        {firebaseProjectId ? (
          <link rel="preconnect" href={`https://${firebaseProjectId}.firebaseapp.com`} crossOrigin="anonymous" />
        ) : null}
        {firebaseProjectId ? (
          <link rel="dns-prefetch" href={`https://${firebaseProjectId}.firebaseapp.com`} />
        ) : null}
        <link rel="preconnect" href="https://apis.google.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://apis.google.com" />
        {googleTagManagerId ? (
          <Script
            id="google-tag-manager"
            strategy="lazyOnload"
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){
                  w[l]=w[l]||[];
                  w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
                  var f=d.getElementsByTagName(s)[0],
                    j=d.createElement(s),
                    dl=l!='dataLayer'?'&l='+l:'';
                  j.async=true;
                  j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
                  f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','${googleTagManagerId}');
              `,
            }}
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
        <WebVitalsReporter />
        {googleTagManagerId ? (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${googleTagManagerId}`}
              height="0"
              width="0"
              style={{ display: "none", visibility: "hidden" }}
              title="Google Tag Manager"
            />
          </noscript>
        ) : null}
        <div className="page-scale-root">
          <ClientWrapper>
            <Suspense fallback={layoutFallback}>
              <LayoutHost>{children}</LayoutHost>
            </Suspense>
          </ClientWrapper>
        </div>
        <Suspense>
          <LocalBusinessJsonLdWithRating />
        </Suspense>
      </body>
    </html>
  );
}
