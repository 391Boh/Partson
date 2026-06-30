import type { Metadata } from "next";

const DEFAULT_IMAGE = {
  url: "/Car-parts-fullwidth.png",
  width: 1200,
  height: 630,
  alt: "PartsON - автозапчастини",
};

export const STORE_PHONE_DISPLAY = "+38 (063) 421-18-51";
export const STORE_PHONE_TEL = "+380634211851";
export const STORE_ADDRESS = "Львів, вул. Перфецького, 8";
export const STORE_PHONE_SEO_LABEL = `☎️ ${STORE_PHONE_DISPLAY}`;
export const STORE_ADDRESS_SEO_LABEL = `📍 ${STORE_ADDRESS}`;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;

const BASE_KEYWORDS = [
  "PartsON",
  "автозапчастини",
  "автозапчастини львів",
  "автозапчастини україна",
  "каталог автозапчастин",
  "онлайн каталог автозапчастин",
  "купити автозапчастини",
  "підбір автозапчастин",
  "підбір автозапчастин за vin",
  "пошук запчастин за артикулом",
  "пошук запчастин за кодом",
  "магазин запчастин",
  "магазин автозапчастин",
  "магазин автозапчастин львів",
  "магазин автозапчастин перфецького",
  "доставка автозапчастин львів",
  "доставка автозапчастин україна",
];

const mergeKeywords = (...groups: Array<Array<string | null | undefined> | undefined>) =>
  Array.from(
    new Set(
      groups
        .flatMap((group) => group ?? [])
        .map((item) => (item || "").trim())
        .filter(Boolean)
    )
  );

export const trimSeoDescription = (
  value: string,
  maxLength = SEO_DESCRIPTION_MAX_LENGTH
) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const truncated = normalized.slice(0, maxLength + 1);
  const lastSentenceBreak = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? ")
  );
  const lastSpace = truncated.lastIndexOf(" ");
  const cutAt =
    lastSentenceBreak >= Math.floor(maxLength * 0.58)
      ? lastSentenceBreak + 1
      : lastSpace >= Math.floor(maxLength * 0.7)
        ? lastSpace
        : maxLength;

  return `${normalized.slice(0, cutAt).replace(/[,:;\s]+$/u, "").trim()}…`;
};

export const buildSeoContactLine = () =>
  `${STORE_PHONE_SEO_LABEL}. ${STORE_ADDRESS_SEO_LABEL}.`;

export const appendSeoContact = (
  value: string,
  maxLength = SEO_DESCRIPTION_MAX_LENGTH
) => {
  const contactLine = buildSeoContactLine();
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const baseMaxLength = Math.max(72, maxLength - contactLine.length - 1);
  const base = trimSeoDescription(normalizedValue, baseMaxLength);

  return trimSeoDescription(`${base} ${contactLine}`, maxLength);
};

type BuildPageMetadataOptions = {
  title: string;
  description: string;
  canonicalPath: string;
  keywords?: string[];
  image?: {
    url: string;
    width?: number;
    height?: number;
    alt?: string;
  };
  openGraphTitle?: string;
  openGraphDescription?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  type?: "website" | "article";
  index?: boolean;
  follow?: boolean;
  icons?: Metadata["icons"];
};

export const buildPageMetadata = ({
  title,
  description,
  canonicalPath,
  keywords = [],
  image = DEFAULT_IMAGE,
  openGraphTitle,
  openGraphDescription,
  twitterTitle,
  twitterDescription,
  type = "website",
  index = true,
  follow = true,
  icons,
}: BuildPageMetadataOptions): Metadata => {
  const normalizedDescription = trimSeoDescription(description);
  const normalizedOpenGraphDescription = openGraphDescription
    ? trimSeoDescription(openGraphDescription)
    : normalizedDescription;
  const normalizedTwitterDescription = twitterDescription
    ? trimSeoDescription(twitterDescription)
    : normalizedOpenGraphDescription;

  return {
    title,
    description: normalizedDescription,
    category: "auto parts",
    authors: [{ name: "PartsON" }],
    creator: "PartsON",
    publisher: "PartsON",
    alternates: {
      canonical: canonicalPath,
      languages: {
        "uk-UA": canonicalPath,
        "x-default": canonicalPath,
      },
    },
    keywords: mergeKeywords(BASE_KEYWORDS, keywords),
    openGraph: {
      type,
      locale: "uk_UA",
      url: canonicalPath,
      siteName: "PartsON",
      title: openGraphTitle ?? `${title} | PartsON`,
      description: normalizedOpenGraphDescription,
      images: [
        {
          url: image.url,
          width: image.width ?? DEFAULT_IMAGE.width,
          height: image.height ?? DEFAULT_IMAGE.height,
          alt: image.alt ?? DEFAULT_IMAGE.alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: twitterTitle ?? openGraphTitle ?? `${title} | PartsON`,
      description: normalizedTwitterDescription,
      images: [{ url: image.url, alt: image.alt ?? DEFAULT_IMAGE.alt }],
    },
    icons,
    other: {
      "geo.region": "UA-46",
      "geo.placename": "Львів",
      "business:contact_data:locality": "Львів",
      "business:contact_data:country_name": "Україна",
    },
    robots: {
      index,
      follow,
      googleBot: {
        index,
        follow,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
};
