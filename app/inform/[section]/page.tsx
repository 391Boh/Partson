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

  const diagnosticsSchema =
    resolvedSection.key === "diagnostics"
      ? {
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${getSiteUrl()}/inform/diagnostics#computer-diagnostics`,
          name: "Комп'ютерна діагностика авто у Львові",
          serviceType: "Комп'ютерна діагностика автомобіля",
          description:
            "OBD-II/EOBD діагностика авто у Львові: Check Engine, ECU, ABS, ESP, SRS Airbag, АКПП, розшифрування кодів помилок, перевірка перед купівлею та підбір автозапчастин після діагностики.",
          areaServed: {
            "@type": "City",
            name: "Львів",
          },
          provider: {
            "@type": "AutoPartsStore",
            name: "PartsON",
            url: getSiteUrl(),
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
              description: "Вартість діагностики узгоджується після уточнення авто та симптомів.",
            },
          },
        }
      : null;

  return (
    <>
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
