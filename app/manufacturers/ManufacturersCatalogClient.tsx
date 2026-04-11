"use client";

import dynamic from "next/dynamic";

const BrandCarousel = dynamic(() => import("app/components/Brands"), {
  loading: () => null,
});

export default function ManufacturersCatalogClient() {
  return <BrandCarousel playEntranceAnimations={false} />;
}
