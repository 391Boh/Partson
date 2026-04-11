"use client";

import dynamic from "next/dynamic";

const ProductFetcher = dynamic(() => import("app/components/tovar"), {
  loading: () => null,
});

export default function GroupsCatalogClient() {
  return <ProductFetcher playEntranceAnimations={false} />;
}
