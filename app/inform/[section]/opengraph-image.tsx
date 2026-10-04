import { OG_CARD_CONTENT_TYPE, OG_CARD_SIZE, loadOgPhoto, renderOgCard } from "app/lib/og-card";

import {
  DEFAULT_INFORMATION_SECTION,
  INFORMATION_SECTION_ACCENTS,
  getInformationSection,
  type InformationSectionKey,
} from "../section-config";

// Store-facing sections show the real storefront photo next to the copy.
const SECTION_PHOTOS: Partial<Record<InformationSectionKey, string>> = {
  about: "store-4.jpg",
  location: "store-1.jpg",
};

export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

// Docs type these params as a plain object (the image function gets a
// promise); awaiting covers either shape.
export async function generateImageMetadata({
  params,
}: {
  params: { section: string } | Promise<{ section: string }>;
}) {
  const { section } = await params;
  const resolved = getInformationSection(section);
  return [
    {
      id: "card",
      size,
      contentType,
      alt: resolved ? `${resolved.pageHeading} — PartsON, Львів` : "PartsON — магазин автозапчастин у Львові",
    },
  ];
}

export default async function Image({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const resolved = getInformationSection(section) ?? getInformationSection(DEFAULT_INFORMATION_SECTION)!;
  const photoName = SECTION_PHOTOS[resolved.key];

  return renderOgCard({
    kicker: `Інформація · ${resolved.title}`,
    title: resolved.pageHeading,
    facts: resolved.facts,
    photo: photoName ? await loadOgPhoto(photoName) : undefined,
    accent: INFORMATION_SECTION_ACCENTS[resolved.key],
  });
}
