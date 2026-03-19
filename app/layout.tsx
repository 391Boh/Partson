import { Geist_Mono, Montserrat } from "next/font/google";
import { Exo_2, Manrope } from "next/font/google";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Script from "next/script";
import ClientWrapper from "./client-wrapper";
import LayoutHost from "./components/LayoutHost";
import PageLoadingShell from "./components/PageLoadingShell";
import { getSiteUrl } from "./lib/site-url";
import "./globals.css";

const montserrat = { className: "", variable: "" };

const uiFont = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-ui",
  display: "swap",
});

const displayFont = Exo_2({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

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

export const metadata: Metadata = {
  metadataBase: siteUrlObject,
  title: {
    default: "PartsON - Магазин автозапчастин",
    template: "%s | PartsON",
  },
  description:
    "Каталог автозапчастин з актуальною наявністю, цінами та швидким підбором деталей за кодом, артикулом і виробником.",
  applicationName: "PartsON",
  category: "auto parts",
  keywords: [
    "автозапчастини",
    "каталог автозапчастин",
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
    description:
      "Каталог автозапчастин з актуальною наявністю, цінами та швидким підбором деталей.",
    images: [
      {
        url: "/Car-parts-fullwidth.png",
        alt: "PartsON - автозапчастини",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "PartsON - Магазин автозапчастин",
    description:
      "Каталог автозапчастин з актуальною наявністю, цінами та підбором за кодом і виробником.",
    images: ["/Car-parts-fullwidth.png"],
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
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
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
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "18:00",
    },
  ],
};

const layoutFallback = <PageLoadingShell label="Завантаження сторінки..." cardsCount={4} />;

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
        <Script
          id="strip-fdprocessedid"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var attrName = 'fdprocessedid';
                  var cleanNode = function(node) {
                    if (!node || node.nodeType !== 1) return;
                    if (node.hasAttribute && node.hasAttribute(attrName)) {
                      node.removeAttribute(attrName);
                    }
                    if (node.querySelectorAll) {
                      var nested = node.querySelectorAll('[' + attrName + ']');
                      for (var i = 0; i < nested.length; i += 1) {
                        nested[i].removeAttribute(attrName);
                      }
                    }
                  };

                  var cleanDocument = function() {
                    cleanNode(document.documentElement);
                  };

                  cleanDocument();

                  if (typeof MutationObserver === 'function' && document.documentElement) {
                    var observer = new MutationObserver(function(mutations) {
                      for (var i = 0; i < mutations.length; i += 1) {
                        var mutation = mutations[i];
                        if (mutation.type === 'attributes' && mutation.target) {
                          cleanNode(mutation.target);
                          continue;
                        }
                        if (
                          mutation.type === 'childList' &&
                          mutation.addedNodes &&
                          mutation.addedNodes.length
                        ) {
                          for (var j = 0; j < mutation.addedNodes.length; j += 1) {
                            cleanNode(mutation.addedNodes[j]);
                          }
                        }
                      }
                    });

                    observer.observe(document.documentElement, {
                      subtree: true,
                      childList: true,
                      attributes: true,
                      attributeFilter: [attrName],
                    });
                  }

                  document.addEventListener('DOMContentLoaded', cleanDocument, { once: true });
                  window.addEventListener('load', cleanDocument, { once: true });
                } catch (e) {}
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteNavigationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessJsonLd) }}
        />
      </head>
      <body
        className={`${uiFont.className} ${uiFont.variable} ${displayFont.variable} ${geistMono.variable}`}
      >
        <div className="page-scale-root">
          <ClientWrapper>
            <Suspense fallback={layoutFallback}>
              <LayoutHost>{children}</LayoutHost>
            </Suspense>
          </ClientWrapper>
        </div>
      </body>
    </html>
  );
}
