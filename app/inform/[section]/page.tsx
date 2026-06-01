import type { Metadata } from "next";
import { notFound } from "next/navigation";

import InformationPageClient from "../InformationPageClient";
import {
  getInformationMetadata,
  getInformationSection,
  informationSections,
  type InformationSectionKey,
} from "../section-config";
import { getSiteUrl } from "app/lib/site-url";

interface InformationSectionPageProps {
  params: Promise<{
    section: string;
  }>;
}

export function generateStaticParams() {
  return informationSections.map((section) => ({ section: section.key }));
}

export async function generateMetadata({
  params,
}: InformationSectionPageProps): Promise<Metadata> {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);

  if (!resolvedSection) {
    return {};
  }

  return getInformationMetadata(resolvedSection.key);
}

export default async function InformationSectionPage({
  params,
}: InformationSectionPageProps) {
  const { section } = await params;
  const resolvedSection = getInformationSection(section);

  if (!resolvedSection) {
    notFound();
  }

  const siteUrl = getSiteUrl();
  const genericInformationSchema =
    resolvedSection.key !== "about" && resolvedSection.key !== "diagnostics"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Головна",
                  item: siteUrl,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Інформація",
                  item: `${siteUrl}/inform`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: resolvedSection.title,
                  item: `${siteUrl}/inform/${resolvedSection.key}`,
                },
              ],
            },
            {
              "@type": "WebPage",
              "@id": `${siteUrl}/inform/${resolvedSection.key}#webpage`,
              name: resolvedSection.seoTitle,
              url: `${siteUrl}/inform/${resolvedSection.key}`,
              description: resolvedSection.seoDescription,
              inLanguage: "uk-UA",
              isPartOf: {
                "@type": "WebSite",
                name: "PartsON",
                url: siteUrl,
              },
              about: {
                "@type": "AutoPartsStore",
                "@id": `${siteUrl}/#organization`,
                name: "PartsON",
                telephone: "+380634211851",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "вул. Перфецького, 8",
                  addressLocality: "Львів",
                  addressCountry: "UA",
                },
              },
            },
          ],
        }
      : null;
  const deliverySchema =
    resolvedSection.key === "delivery"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Service",
              "@id": `${siteUrl}/inform/delivery#delivery-service`,
              name: "Доставка автозапчастин у Львові та по Україні",
              serviceType: "Доставка автозапчастин",
              description:
                "Доставка автозапчастин PartsON у Львові, самовивіз з вул. Перфецького, 8 та відправлення у кожне місто України Новою Поштою, Укрпоштою або Meest.",
              provider: {
                "@type": "AutoPartsStore",
                "@id": `${siteUrl}/#organization`,
                name: "PartsON",
                url: siteUrl,
                telephone: "+380634211851",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "вул. Перфецького, 8",
                  addressLocality: "Львів",
                  addressCountry: "UA",
                },
              },
              areaServed: [
                { "@type": "City", name: "Львів" },
                { "@type": "City", name: "Київ" },
                { "@type": "City", name: "Харків" },
                { "@type": "City", name: "Одеса" },
                { "@type": "City", name: "Дніпро" },
                { "@type": "Country", name: "Україна" },
              ],
              availableChannel: [
                {
                  "@type": "ServiceChannel",
                  name: "Самовивіз у Львові",
                  serviceLocation: {
                    "@type": "Place",
                    name: "PartsON Львів",
                    address: {
                      "@type": "PostalAddress",
                      streetAddress: "вул. Перфецького, 8",
                      addressLocality: "Львів",
                      addressCountry: "UA",
                    },
                  },
                },
                {
                  "@type": "ServiceChannel",
                  name: "Відправлення перевізниками по Україні",
                },
              ],
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Чи є доставка автозапчастин у Львові?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Так. У Львові доступний самовивіз з магазину PartsON на вул. Перфецького, 8, а також доставка по місту за домовленістю з менеджером.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Чи відправляє PartsON автозапчастини по Україні?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Так. PartsON відправляє автозапчастини у кожне місто України через Нову Пошту, Укрпошту або Meest залежно від замовлення і побажань клієнта.",
                  },
                },
              ],
            },
          ],
        }
      : null;
  const aboutSchema =
    resolvedSection.key === "about"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Головна",
                  item: siteUrl,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Інформація",
                  item: `${siteUrl}/inform`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: "Про PartsON",
                  item: `${siteUrl}/inform/about`,
                },
              ],
            },
            {
              "@type": "AboutPage",
              "@id": `${siteUrl}/inform/about#about`,
              name: "Про PartsON — магазин автозапчастин у Львові",
              description:
                "PartsON — інтернет-магазин і магазин автозапчастин у Львові на вул. Перфецького, 8 з підбором деталей за VIN, артикулом, кодом і маркою авто.",
              mainEntity: {
                "@type": "AutoPartsStore",
                "@id": `${siteUrl}/#organization`,
                name: "PartsON",
                url: siteUrl,
                image: `${siteUrl}/storefront/photos/partson-store-1.jpg`,
                logo: `${siteUrl}/Car-parts-fullwidth.png`,
                telephone: "+380634211851",
                email: "romaniukbboogg@gmail.com",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "вул. Перфецького, 8",
                  addressLocality: "Львів",
                  addressCountry: "UA",
                },
                areaServed: [
                  {
                    "@type": "City",
                    name: "Львів",
                  },
                  {
                    "@type": "Country",
                    name: "Україна",
                  },
                ],
                makesOffer: [
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Service",
                      name: "Підбір автозапчастин за VIN, артикулом і кодом",
                    },
                  },
                  {
                    "@type": "Offer",
                    itemOffered: {
                      "@type": "Product",
                      name: "Оригінальні автозапчастини та перевірені аналоги",
                    },
                  },
                ],
              },
            },
          ],
        }
      : null;
  const diagnosticsSchema =
    resolvedSection.key === "diagnostics"
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "BreadcrumbList",
              itemListElement: [
                {
                  "@type": "ListItem",
                  position: 1,
                  name: "Головна",
                  item: siteUrl,
                },
                {
                  "@type": "ListItem",
                  position: 2,
                  name: "Інформація",
                  item: `${siteUrl}/inform`,
                },
                {
                  "@type": "ListItem",
                  position: 3,
                  name: "Комп'ютерна діагностика авто у Львові",
                  item: `${siteUrl}/inform/diagnostics`,
                },
              ],
            },
            {
              "@type": "Service",
              "@id": `${siteUrl}/inform/diagnostics#computer-diagnostics`,
              name: "Комп'ютерна діагностика авто у Львові",
              alternateName: [
                "OBD діагностика авто",
                "Автодіагностика Львів",
                "Діагностика Check Engine",
              ],
              serviceType: "Комп'ютерна діагностика автомобіля",
              description:
                "OBD-II/EOBD діагностика авто у Львові: Check Engine, ECU, ABS, ESP, SRS Airbag, АКПП, розшифрування кодів помилок, перевірка перед купівлею, виїзна діагностика та підбір автозапчастин після перевірки.",
              areaServed: [
                {
                  "@type": "City",
                  name: "Львів",
                },
                {
                  "@type": "AdministrativeArea",
                  name: "Львівська область",
                },
              ],
              provider: {
                "@type": "AutoPartsStore",
                name: "PartsON",
                url: siteUrl,
                telephone: "+380934804261",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "вул. Перфецького, 8",
                  addressLocality: "Львів",
                  addressCountry: "UA",
                },
              },
              offers: {
                "@type": "Offer",
                availability: "https://schema.org/InStock",
                priceSpecification: {
                  "@type": "PriceSpecification",
                  priceCurrency: "UAH",
                  description:
                    "Вартість діагностики узгоджується після уточнення авто та симптомів.",
                },
              },
            },
            {
              "@type": "FAQPage",
              mainEntity: [
                {
                  "@type": "Question",
                  name: "Що входить у комп'ютерну діагностику авто?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Підключення OBD-II/EOBD сканера, зчитування помилок ECU, ABS, ESP, SRS, АКПП, перегляд параметрів у реальному часі та пояснення можливих причин несправності.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Коли варто записатися на діагностику?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Коли горить Check Engine, ABS, ESP, Airbag, авто погано заводиться, втрачає тягу, збільшилась витрата пального, є ривки, помилки коробки або потрібна перевірка перед купівлею.",
                  },
                },
                {
                  "@type": "Question",
                  name: "Чи можна підібрати запчастини після діагностики?",
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: "Так. Після перевірки PartsON може підібрати датчики, фільтри, свічки, котушки, гальмівні компоненти, елементи підвіски та інші автозапчастини під конкретну причину несправності.",
                  },
                },
              ],
            },
          ],
        }
      : null;

  return (
    <>
      {genericInformationSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(genericInformationSchema) }}
        />
      ) : null}
      {deliverySchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(deliverySchema) }}
        />
      ) : null}
      {aboutSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutSchema) }}
        />
      ) : null}
      {diagnosticsSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(diagnosticsSchema) }}
        />
      ) : null}
      <InformationPageClient
        initialSectionKey={resolvedSection.key as InformationSectionKey}
      />
    </>
  );
}
