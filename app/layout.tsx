import { Geist_Mono, Montserrat } from "next/font/google";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Script from "next/script";
import ClientWrapper from "./client-wrapper";
import LayoutHost from "./components/LayoutHost";
import { getSiteUrl } from "./lib/site-url";
import "./globals.css";

const montserrat = Montserrat({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = getSiteUrl();
const siteUrlObject = (() => {
  try {
    return new URL(siteUrl);
  } catch {
    return new URL("http://localhost:3000");
  }
})();

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
  },
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
  },
  manifest: "/manifest.webmanifest",
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
  potentialAction: {
    "@type": "SearchAction",
    target: `${siteUrl}/katalog?search={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "AutoPartsStore",
  name: "PartsON",
  url: siteUrl,
  logo: `${siteUrl}/Car-parts-fullwidth.png`,
  image: `${siteUrl}/Car-parts-fullwidth.png`,
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
  sameAs: [],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="uk">
      <head>
        <link rel="shortcut icon" href="/Car-parts-fullwidth.png" />
        <link rel="manifest" href="/manifest.webmanifest" />
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body className={`${montserrat.className} ${montserrat.variable} ${geistMono.variable}`}>
        <ClientWrapper>
          <Suspense fallback={<main className="min-h-screen">{children}</main>}>
            <LayoutHost>{children}</LayoutHost>
          </Suspense>
        </ClientWrapper>
      </body>
    </html>
  );
}
