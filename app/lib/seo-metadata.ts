import type { Metadata } from "next";

const DEFAULT_IMAGE = {
  url: "/Car-parts-fullwidth.png",
  width: 1200,
  height: 630,
  alt: "PartsON - автозапчастини",
};

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
}: BuildPageMetadataOptions): Metadata => ({
  title,
  description,
  category: "auto parts",
  authors: [{ name: "PartsON" }],
  creator: "PartsON",
  publisher: "PartsON",
  alternates: {
    canonical: canonicalPath,
    languages: {
      "uk-UA": canonicalPath,
      uk: canonicalPath,
    },
  },
  keywords: mergeKeywords(BASE_KEYWORDS, keywords),
  openGraph: {
    type,
    locale: "uk_UA",
    url: canonicalPath,
    siteName: "PartsON",
    title: openGraphTitle ?? `${title} | PartsON`,
    description: openGraphDescription ?? description,
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
    description: twitterDescription ?? openGraphDescription ?? description,
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
});
