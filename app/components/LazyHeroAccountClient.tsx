"use client";

import dynamic from "next/dynamic";
import HeroAccountClientDirect from "./HeroAccountClient";

type HeroAccountClientProps = {
  cardGradientBase: string;
  cardGradientHover: string;
  cardInteractionStatic: string;
  variant?: "actions" | "benefits";
};

// ssr: false avoids hydration mismatch — client localStorage auth check can differ from server
const HeroAccountClientLazy = dynamic(() => import("./HeroAccountClient"), {
  ssr: false,
});

export default function LazyHeroAccountClient(props: HeroAccountClientProps) {
  // Benefits card content (benefit items) is identical server/client on first render
  // (hasOrders is null on both sides), so SSR is safe and eliminates 1400ms CLS.
  if (props.variant === "benefits") {
    return <HeroAccountClientDirect {...props} />;
  }
  return <HeroAccountClientLazy {...props} />;
}
