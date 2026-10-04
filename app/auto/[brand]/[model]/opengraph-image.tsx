import { autoOgAlt, renderAutoOgImage } from "app/lib/auto-og-image";
import { OG_CARD_CONTENT_TYPE, OG_CARD_SIZE } from "app/lib/og-card";

export const size = OG_CARD_SIZE;
export const contentType = OG_CARD_CONTENT_TYPE;

type Params = { brand: string; model: string };

export async function generateImageMetadata({ params }: { params: Params | Promise<Params> }) {
  const { brand, model } = await params;
  return [{ id: "card", size, contentType, alt: await autoOgAlt(brand, model) }];
}

export default async function Image({ params }: { params: Promise<Params> }) {
  const { brand, model } = await params;
  return renderAutoOgImage(brand, model);
}
