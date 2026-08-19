import type { Metadata } from "next";

const DEFAULT_IMAGE = {
  url: "/opengraph-partson-v2.png",
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
// Google truncates around ~60 chars in search results. The root layout's
// title template ("%s | PartsON", see app/layout.tsx) tacks on 10 more
// characters after every page title, so that has to come out of the budget
// too — otherwise a title that reads fine on its own (e.g. a long producer
// or category name plus a short suffix) still gets cut off once rendered.
export const SEO_TITLE_MAX_LENGTH = 60;
const TITLE_TEMPLATE_SUFFIX_LENGTH = " | PartsON".length;

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

const mergeKeywords = (...groups: Array<Array<string | null | undefined> | undefined>) => {
  const seen = new Set<string>();

  return groups
    .flatMap((group) => group ?? [])
    .map((item) => (item || "").replace(/\s+/g, " ").trim())
    .filter((item) => {
      if (!item) return false;
      const key = item.toLocaleLowerCase("uk-UA");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const titleIncludesBrand = (title: string) => /(^|\W)partson(\W|$)/iu.test(title);

// Appends `suffix` to `base` only if the result still clears the title
// budget once the layout's " | PartsON" template is applied — otherwise
// falls back to the bare base rather than risk a Google-truncated title.
// Use for any title built from a variable-length name (brand, producer,
// category) plus a fixed decorative tail, since the tail is the part that's
// safe to drop and the name is the part search results actually need.
export const buildAdaptiveSeoTitle = (
  base: string,
  suffix: string,
  maxLength: number = SEO_TITLE_MAX_LENGTH
) => {
  const budget = maxLength - TITLE_TEMPLATE_SUFFIX_LENGTH;
  const full = `${base}${suffix}`;
  return full.length <= budget ? full : base;
};

const buildSocialTitle = (title: string) =>
  titleIncludesBrand(title) ? title : `${title} | PartsON`;

export const trimSeoDescription = (
  value: string,
  maxLength = SEO_DESCRIPTION_MAX_LENGTH
) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  // Reserve one character for the ellipsis. Previously the text itself could
  // reach maxLength and then `…` made the final meta description 161 chars.
  const contentMaxLength = Math.max(1, maxLength - 1);
  const truncated = normalized.slice(0, contentMaxLength + 1);
  const lastSentenceBreak = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? ")
  );
  const lastSpace = truncated.lastIndexOf(" ");
  const cutAt =
    lastSentenceBreak >= Math.floor(contentMaxLength * 0.58)
      ? lastSentenceBreak + 1
      : lastSpace >= Math.floor(contentMaxLength * 0.7)
        ? lastSpace
        : contentMaxLength;

  const content = normalized
    .slice(0, Math.min(cutAt, contentMaxLength))
    .replace(/[,:;\s]+$/u, "")
    .trim();

  return `${content}…`;
};

export const buildSeoContactLine = () =>
  `${STORE_ADDRESS}. Телефон: ${STORE_PHONE_DISPLAY}.`;

// Contact info leads every description (address, then a plain phone number
// with no icon) so it's the first thing visible in a cut-off search snippet,
// followed by the page-specific text.
export const appendSeoContact = (
  value: string,
  maxLength = SEO_DESCRIPTION_MAX_LENGTH
) => {
  const contactLine = buildSeoContactLine();
  const normalizedValue = value.replace(/\s+/g, " ").trim();
  const baseMaxLength = Math.max(72, maxLength - contactLine.length - 1);
  const base = trimSeoDescription(normalizedValue, baseMaxLength);

  return trimSeoDescription(`${contactLine} ${base}`, maxLength);
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
    // The root layout appends "| PartsON" through its title template. Pages
    // that already name the brand need an absolute title to avoid output such
    // as "PartsON ... | PartsON" in search results.
    title: titleIncludesBrand(title) ? { absolute: title } : title,
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
      title: openGraphTitle ?? buildSocialTitle(title),
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
      title: twitterTitle ?? openGraphTitle ?? buildSocialTitle(title),
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
