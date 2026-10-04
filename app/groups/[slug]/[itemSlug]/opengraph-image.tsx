import { groupOgAlt, renderGroupOgImage } from "app/lib/group-og-image";
import { OG_CARD_CONTENT_TYPE, OG_CARD_SIZE } from "app/lib/og-card";

export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

type Params = { slug: string; itemSlug: string };

export async function generateImageMetadata({ params }: { params: Params | Promise<Params> }) {
  const { slug, itemSlug } = await params;
  return [{ id: "card", size, contentType, alt: await groupOgAlt(slug, itemSlug) }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug, itemSlug } = await params;
  return renderGroupOgImage(slug, itemSlug);
}
